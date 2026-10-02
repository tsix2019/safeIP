/* SafeIP · gping.js — 全球 Ping：check-host.net 为主，Globalping 为回退 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;
  const enc = encodeURIComponent;
  const JSON_ACCEPT = { accept: 'application/json' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function stats(rtts) {
    if (!rtts.length) return { min: null, avg: null, max: null };
    const sum = rtts.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...rtts),
      avg: Math.round((sum / rtts.length) * 10) / 10,
      max: Math.max(...rtts),
    };
  }

  /**
   * 纯函数：合并 check-host 的节点表与结果。
   * nodes: { id: [cc, country, city, nodeIP, asn] }；result: { id: null | [null] | [[[状态, 秒, ip?], ...]] }
   */
  function parseCheckHost(nodes, result) {
    return Object.entries(nodes || {}).map(([id, info]) => {
      const [cc, country, city, nodeIP, asn] = info || [];
      const base = { id, cc: String(cc || '').toUpperCase(), country: country || '', city: city || '', asn: asn || '', nodeIP: nodeIP || '' };
      const r = result ? result[id] : null;
      if (r == null) return { ...base, status: 'pending', rtts: [], sent: 0, loss: null, ...stats([]) };
      const packets = Array.isArray(r) && Array.isArray(r[0]) ? r[0] : null;
      if (!packets) return { ...base, status: 'error', rtts: [], sent: 0, loss: null, ...stats([]) }; // 节点无法解析目标
      const rtts = packets
        .filter((p) => Array.isArray(p) && p[0] === 'OK' && typeof p[1] === 'number')
        .map((p) => Math.round(p[1] * 10000) / 10);
      const sent = packets.length;
      return {
        ...base,
        status: rtts.length ? 'ok' : 'timeout',
        rtts,
        sent,
        loss: sent ? Math.round((1 - rtts.length / sent) * 100) : null,
        resolved: (packets[0] && packets[0][2]) || '',
        ...stats(rtts),
      };
    });
  }

  /** 纯函数：Globalping 测量结果 → 与 check-host 相同的结构 */
  function parseGlobalping(m) {
    return ((m && m.results) || []).map((r, i) => {
      const p = r.probe || {};
      const res = r.result || {};
      const st = res.stats || {};
      const rtts = (res.timings || []).map((t) => t.rtt).filter((x) => typeof x === 'number');
      let status = 'error';
      if (res.status === 'in-progress') status = 'pending';
      else if (rtts.length) status = 'ok';
      else if (res.status === 'finished') status = 'timeout';
      return {
        id: `gp-${i}`,
        cc: String(p.country || '').toUpperCase(),
        country: '',
        city: p.city || '',
        asn: p.asn ? `AS${p.asn}` : '',
        network: p.network || '',
        status,
        rtts,
        sent: st.total || rtts.length,
        loss: st.loss != null ? Math.round(st.loss) : null,
        min: st.min != null ? st.min : null,
        avg: st.avg != null ? st.avg : null,
        max: st.max != null ? st.max : null,
      };
    });
  }

  async function viaCheckHost(target, onUpdate) {
    const { data: start } = await util.request(
      `https://check-host.net/check-ping?host=${enc(target)}&max_nodes=40`, { headers: JSON_ACCEPT, timeout: 15000 }
    );
    if (!start || !start.ok || !start.request_id) throw util.makeError('parse');
    const meta = { provider: 'check-host.net', link: start.permanent_link };
    let list = parseCheckHost(start.nodes, null);
    onUpdate(list, meta);
    for (let i = 0; i < 15 && list.some((x) => x.status === 'pending'); i++) {
      await sleep(1500);
      try {
        const { data } = await util.request(
          `https://check-host.net/check-result/${enc(start.request_id)}`, { headers: JSON_ACCEPT, timeout: 10000 }
        );
        list = parseCheckHost(start.nodes, data);
        onUpdate(list, meta);
      } catch (e) { /* 单次轮询失败，下一轮再试 */ }
    }
    list = list.map((x) => (x.status === 'pending' ? { ...x, status: 'timeout' } : x));
    onUpdate(list, meta);
    return { ...meta, list };
  }

  async function viaGlobalping(target, onUpdate) {
    const body = JSON.stringify({ type: 'ping', target, limit: 30, measurementOptions: { packets: 4 } });
    const { data: created } = await util.request('https://api.globalping.io/v1/measurements', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, timeout: 15000,
    });
    const meta = { provider: 'Globalping', link: `https://globalping.io/?measurement=${created.id}` };
    let list = [];
    for (let i = 0; i < 20; i++) {
      await sleep(i ? 1500 : 800);
      const { data } = await util.request(`https://api.globalping.io/v1/measurements/${enc(created.id)}`, { timeout: 10000 });
      list = parseGlobalping(data);
      onUpdate(list, meta);
      if (data.status !== 'in-progress') break;
    }
    return { ...meta, list };
  }

  /** 发起全球 Ping；onUpdate(list, meta) 会被多次调用以便逐步渲染 */
  async function run(target, onUpdate = () => {}) {
    try {
      return await viaCheckHost(target, onUpdate);
    } catch (e) {
      return viaGlobalping(target, onUpdate);
    }
  }

  SafeIP.gping = { run, parseCheckHost, parseGlobalping };
})(typeof window !== 'undefined' ? window : globalThis);

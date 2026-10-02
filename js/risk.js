/* SafeIP · risk.js — IP 风险评分：采集公开信号，按透明规则打分（非商业风控分） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;
  const enc = encodeURIComponent;

  /** 允许公共解析器查询的 DNS 黑名单（Spamhaus 会拒绝公共解析器，未采用） */
  const DNSBLS = [
    { id: 'spamcop', name: 'SpamCop', zone: 'bl.spamcop.net', desc: '垃圾邮件来源' },
    { id: 'dronebl', name: 'DroneBL', zone: 'dnsbl.dronebl.org', desc: '开放代理 / 僵尸网络' },
    { id: 'uceprotect', name: 'UCEPROTECT L1', zone: 'dnsbl-1.uceprotect.net', desc: '滥用来源 IP' },
    { id: 'psbl', name: 'PSBL', zone: 'psbl.surriel.com', desc: '垃圾邮件陷阱' },
    { id: 'mailspike', name: 'Mailspike', zone: 'bl.mailspike.net', desc: '邮件信誉' },
    { id: 's5h', name: 's5h', zone: 'all.s5h.net', desc: '综合黑名单' },
    { id: 'tor', name: 'dan.me.uk', zone: 'tor.dan.me.uk', desc: 'Tor 节点', tor: true },
  ];

  /** PeeringDB 网络类型中代表机房 / 内容网络的取值 */
  const HOSTING_TYPES = ['Content', 'Network Services'];
  const PDB_TYPE_TEXT = {
    'Cable/DSL/ISP': '宽带运营商', NSP: '骨干 / 转接网络', Content: '内容 / 云服务', Enterprise: '企业网络',
    'Educational/Research': '教育科研', 'Non-Profit': '非营利组织', 'Network Services': '网络服务商',
    Government: '政府网络', 'Route Server': '路由服务器', 'Route Collector': '路由收集器', 'Not Disclosed': '未公开',
  };

  /** 解析 DoH 应答：上榜 true / 未上榜 false / 查询被拒或失败 null */
  function parseDnsbl({ status, answers }) {
    if (status === 3) return false;
    const a = answers.filter((x) => x.type === 1).map((x) => x.data);
    if (!a.length) return status === 0 ? false : null;
    if (a.every((x) => /^127\.255\.255\./.test(x))) return null; // 拒绝 / 超额应答
    return a.some((x) => /^127\./.test(x));
  }

  async function dnsbl(ip, list) {
    try {
      return parseDnsbl(await util.doh(`${util.reverseV4(ip)}.${list.zone}`, 'A'));
    } catch (e) {
      return null;
    }
  }

  async function rirCountry(ip) {
    const { data } = await util.request(`https://stat.ripe.net/data/rir-stats-country/data.json?resource=${enc(ip)}`, { timeout: 12000 });
    const r = data && data.data && data.data.located_resources && data.data.located_resources[0];
    return r && r.location ? String(r.location).toUpperCase() : '';
  }

  const pdbCache = new Map();
  /** PeeringDB 网络资料（按 ASN 缓存） */
  function peeringdb(asn) {
    const n = String(asn).replace(/^as/i, '');
    if (!pdbCache.has(n)) {
      pdbCache.set(n, util.request(`https://www.peeringdb.com/api/net?asn=${enc(n)}`, { timeout: 12000 }).then(({ data }) => {
        const x = data && data.data && data.data[0];
        if (!x) return null;
        const type = x.info_type || (x.info_types && x.info_types[0]) || '';
        return {
          name: x.name, website: x.website, type, typeText: PDB_TYPE_TEXT[type] || type,
          scope: x.info_scope, traffic: x.info_traffic, ratio: x.info_ratio, policy: x.policy_general, irr: x.irr_as_set,
        };
      }).catch(() => null));
    }
    return pdbCache.get(n);
  }

  async function stopForumSpam(ip) {
    const { data } = await util.request(`https://api.stopforumspam.org/api?ip=${enc(ip)}&json`, { timeout: 12000 });
    if (!data || !data.success) throw util.makeError('parse');
    const x = data.ip || {};
    return { appears: !!x.appears, frequency: x.frequency || 0, lastseen: x.lastseen || '', confidence: x.confidence || 0 };
  }

  async function tor(ip) {
    const { data } = await util.request(
      `https://onionoo.torproject.org/details?search=${enc(ip)}&fields=nickname,flags`, { timeout: 12000 }
    );
    const relays = (data && data.relays) || [];
    return {
      relay: relays.length > 0,
      exit: relays.some((r) => (r.flags || []).includes('Exit')),
      nicknames: relays.map((r) => r.nickname).slice(0, 3),
    };
  }

  const LEVEL_TEXT = { low: '低风险', medium: '中风险', high: '高风险', critical: '极高风险' };

  /** 纯函数：按透明规则打分。返回 { score, level, label, factors, native } */
  function score(s) {
    const factors = [];
    const add = (key, label, points, detail) => factors.push({ key, label, points, detail: detail || '' });
    const f = s.flags || {};
    const lists = s.dnsbl || [];

    if (f.proxy) add('proxy', '被标记为代理 / VPN', 40, 'ip-api');
    const torListed = lists.some((x) => x.tor && x.listed);
    if ((s.tor && s.tor.exit) || torListed) add('tor', 'Tor 出口节点', 50, s.tor && s.tor.exit ? 'Onionoo' : 'dan.me.uk');
    else if (s.tor && s.tor.relay) add('tor-relay', 'Tor 中继节点', 10, 'Onionoo');

    const pdbHosting = HOSTING_TYPES.includes(s.asnType);
    if (f.hosting || pdbHosting || s.kind === 'hosting') {
      const by = [f.hosting && 'ip-api', pdbHosting && `PeeringDB：${PDB_TYPE_TEXT[s.asnType] || s.asnType}`,
        !f.hosting && !pdbHosting && 'ASN 名称推测'].filter(Boolean).join('、');
      add('hosting', '机房 / 数据中心 IP', 25, by);
    }
    if (s.rirCC && s.geoCC && s.rirCC !== s.geoCC) {
      add('broadcast', '广播 IP：注册地与使用地不一致', 10, `注册于 ${s.rirCC}，定位在 ${s.geoCC}`);
    }
    const listed = lists.filter((x) => !x.tor && x.listed);
    if (listed.length) add('dnsbl', `被 ${listed.length} 个黑名单收录`, Math.min(45, listed.length * 15), listed.map((x) => x.name).join('、'));
    if (s.sfs && s.sfs.appears) {
      add('sfs', 'StopForumSpam 有滥用记录', Math.min(30, 15 + s.sfs.frequency),
        `${s.sfs.frequency} 次${s.sfs.lastseen ? `，最近 ${s.sfs.lastseen}` : ''}`);
    }

    const total = Math.min(100, factors.reduce((n, x) => n + x.points, 0));
    const level = total < 20 ? 'low' : total < 50 ? 'medium' : total < 75 ? 'high' : 'critical';
    return {
      score: total, level, label: LEVEL_TEXT[level], factors,
      native: s.rirCC && s.geoCC ? s.rirCC === s.geoCC : null,
    };
  }

  const settle = (p) => p.then((v) => v, () => null);

  async function doAssess(ip, identType) {
    const g = await SafeIP.geo.lookup(ip);
    const v4 = util.ipFamily(ip) === 'v4';
    const [rir, pdb, sfs, torInfo, lists] = await Promise.all([
      settle(rirCountry(ip)),
      g.asn ? peeringdb(g.asn) : Promise.resolve(null),
      settle(stopForumSpam(ip)),
      settle(tor(ip)),
      v4 ? Promise.all(DNSBLS.map(async (l) => ({ ...l, listed: await dnsbl(ip, l) }))) : Promise.resolve(null),
    ]);
    const signals = {
      flags: g.flags, identType, kind: SafeIP.analyze.classifyIP(g, identType).kind,
      asnType: pdb && pdb.type, pdb, geoCC: g.cc, rirCC: rir || '', dnsbl: lists, sfs, tor: torInfo,
    };
    return { ip, geo: g, signals, result: score(signals) };
  }

  const cache = new Map();
  /** 评估一个 IP（按 IP 缓存，永不 reject） */
  function assess(ip, identType = '') {
    if (!cache.has(ip)) cache.set(ip, doAssess(ip, identType).catch(() => null));
    return cache.get(ip);
  }

  SafeIP.risk = { DNSBLS, PDB_TYPE_TEXT, LEVEL_TEXT, parseDnsbl, peeringdb, score, assess };
})(typeof window !== 'undefined' ? window : globalThis);

/* SafeIP · dns.js — DNS 泄露检测：随机子域名让解析服务器"现身" */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  /** ip-api EDNS：返回替你查询该随机域名的 DNS 服务器，以及 ECS 子网（如有） */
  async function viaIpApi() {
    const { data } = await util.request(`https://${util.randomLabel(32)}.edns.ip-api.com/json`);
    const resolvers = [];
    if (data && data.dns && util.ipFamily(data.dns.ip)) {
      resolvers.push({ ip: data.dns.ip, hint: data.dns.geo || '' });
    }
    const ecs = data && data.edns && data.edns.ip ? { ip: data.edns.ip, hint: data.edns.geo || '' } : null;
    return { resolvers, ecs };
  }

  /** ipleak.net：返回本次会话中查询过该随机域名的所有 DNS 服务器 */
  async function viaIpleak() {
    const { data } = await util.request(`https://${util.randomLabel(40)}.ipleak.net/dnsdetection/`);
    const ips = Object.keys((data && data.ip) || {}).filter((ip) => util.ipFamily(ip));
    return { resolvers: ips.map((ip) => ({ ip, hint: '' })), ecs: null };
  }

  /** 纯函数：合并多次检测结果。outcomes: [{ via, value } | { via, error }] */
  function merge(outcomes) {
    const map = new Map();
    const errors = [];
    let ecs = null;
    outcomes.forEach((o) => {
      if (o.error) {
        errors.push({ via: o.via, error: o.error });
        return;
      }
      o.value.resolvers.forEach((r) => {
        const cur = map.get(r.ip) || { ip: r.ip, via: [], hint: '' };
        if (!cur.via.includes(o.via)) cur.via.push(o.via);
        if (!cur.hint && r.hint) cur.hint = r.hint;
        map.set(r.ip, cur);
      });
      if (!ecs && o.value.ecs) ecs = o.value.ecs;
    });
    return { resolvers: [...map.values()], ecs, errors };
  }

  async function run() {
    const jobs = [
      ['ip-api', viaIpApi], ['ip-api', viaIpApi], ['ip-api', viaIpApi],
      ['ipleak', viaIpleak], ['ipleak', viaIpleak],
    ];
    const settled = await Promise.allSettled(jobs.map(([, fn]) => fn()));
    return merge(settled.map((s, i) => (
      s.status === 'fulfilled'
        ? { via: jobs[i][0], value: s.value }
        : { via: jobs[i][0], error: (s.reason && s.reason.code) || 'network' }
    )));
  }

  SafeIP.dns = { run, merge };
})(typeof window !== 'undefined' ? window : globalThis);

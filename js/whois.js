/* SafeIP · whois.js — RDAP（域名 / IP / ASN）查询与解析，ASN 资料聚合 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;
  const enc = encodeURIComponent;
  const TIMEOUT = 15000;

  let dnsBootstrap = null;
  /** 通过 IANA 引导表找到某个后缀的 RDAP 服务器；没有则返回 null */
  function tldServer(domain) {
    if (!dnsBootstrap) {
      dnsBootstrap = util.request('https://data.iana.org/rdap/dns.json', { timeout: TIMEOUT })
        .then(({ data }) => data.services || [])
        .catch((e) => {
          dnsBootstrap = null;
          throw e;
        });
    }
    return dnsBootstrap.then((services) => {
      const tld = domain.split('.').pop();
      const svc = services.find(([tlds]) => tlds.includes(tld));
      return svc ? svc[1][0].replace(/\/?$/, '/') : null;
    });
  }

  const PATH = {
    domain: (q) => `domain/${enc(q)}`,
    ip: (q) => `ip/${enc(q)}`,
    autnum: (q) => `autnum/${enc(String(q).replace(/^as/i, ''))}`,
  };

  /** 原始 RDAP JSON。错误码：notld（该后缀无 RDAP）、notfound、timeout、network… */
  async function rdap(kind, q) {
    try {
      return (await util.request(`https://rdap.org/${PATH[kind](q)}`, { timeout: TIMEOUT })).data;
    } catch (e) {
      if (kind !== 'domain') throw e.status === 404 ? util.makeError('notfound') : e;
      // 域名：用 IANA 引导表区分"后缀没有 RDAP"与"查无此域名"，rdap.org 不可用时直连注册局
      const base = await tldServer(q).catch(() => null);
      if (!base) throw util.makeError(e.status === 404 ? 'notld' : e.code);
      try {
        return (await util.request(`${base}${PATH.domain(q)}`, { timeout: TIMEOUT })).data;
      } catch (e2) {
        throw e2.status === 404 ? util.makeError('notfound') : e2;
      }
    }
  }

  // ---------------- 解析（纯函数） ----------------

  function vcard(entity, field) {
    const props = entity && entity.vcardArray && entity.vcardArray[1];
    if (!Array.isArray(props)) return '';
    const p = props.find((x) => x[0] === field);
    if (!p) return '';
    const v = p[3];
    return util.clean(Array.isArray(v) ? v.flat(3).filter(Boolean).join(' ') : v);
  }

  /** 递归收集带有指定角色的实体（如注册商下嵌套的 abuse 联系人） */
  function entities(json, role, out = []) {
    (json.entities || []).forEach((e) => {
      if ((e.roles || []).includes(role)) out.push(e);
      entities(e, role, out);
    });
    return out;
  }

  const entityName = (e) => (e ? vcard(e, 'fn') || vcard(e, 'org') || e.handle || '' : '');
  const firstEmail = (list) => list.map((e) => vcard(e, 'email')).find(Boolean) || '';
  const eventDate = (json, action) => {
    const ev = (json.events || []).find((x) => x.eventAction === action);
    return ev ? ev.eventDate : '';
  };

  function parseDomain(json) {
    const registrar = entities(json, 'registrar')[0];
    const ianaId = registrar && (registrar.publicIds || []).find((p) => /iana/i.test(p.type));
    return {
      kind: 'domain',
      name: String(json.ldhName || '').toLowerCase(),
      unicodeName: json.unicodeName || '',
      handle: json.handle || '',
      status: json.status || [],
      registrar: entityName(registrar),
      registrarId: ianaId ? ianaId.identifier : '',
      registrant: entityName(entities(json, 'registrant')[0]),
      abuse: firstEmail(entities(json, 'abuse')),
      created: eventDate(json, 'registration'),
      updated: eventDate(json, 'last changed'),
      expires: eventDate(json, 'expiration'),
      nameservers: (json.nameservers || []).map((n) => String(n.ldhName || '').toLowerCase()).filter(Boolean),
      dnssec: json.secureDNS ? !!json.secureDNS.delegationSigned : null,
    };
  }

  function parseNetwork(json) {
    const cidrs = (json.cidr0_cidrs || []).map((c) => `${c.v4prefix || c.v6prefix}/${c.length}`);
    const org = entities(json, 'registrant')[0] || entities(json, 'administrative')[0];
    return {
      kind: 'ip',
      handle: json.handle || '',
      name: json.name || '',
      type: json.type || '',
      country: json.country || '',
      range: json.startAddress && json.endAddress ? `${json.startAddress} – ${json.endAddress}` : '',
      cidr: cidrs.join(', '),
      org: entityName(org),
      abuse: firstEmail(entities(json, 'abuse')),
      created: eventDate(json, 'registration'),
      updated: eventDate(json, 'last changed'),
      parent: json.parentHandle || '',
      source: json.port43 || '',
    };
  }

  function parseAutnum(json) {
    const org = entities(json, 'registrant')[0] || entities(json, 'administrative')[0];
    let range = '';
    if (json.startAutnum != null) {
      range = json.startAutnum === json.endAutnum ? `AS${json.startAutnum}` : `AS${json.startAutnum} – AS${json.endAutnum}`;
    }
    return {
      kind: 'autnum',
      handle: json.handle || '',
      name: json.name || '',
      country: json.country || '',
      range,
      org: entityName(org),
      abuse: firstEmail(entities(json, 'abuse')),
      created: eventDate(json, 'registration'),
      updated: eventDate(json, 'last changed'),
      source: json.port43 || '',
    };
  }

  const PARSERS = { domain: parseDomain, ip: parseNetwork, autnum: parseAutnum };

  /** RDAP 查询并解析；返回解析结果与原始 JSON */
  async function lookup(kind, q) {
    const json = await rdap(kind, q);
    return { ...PARSERS[kind](json), raw: json };
  }

  /** 常见的二级公共后缀（公共后缀表的精简版），用于把子域名换成可注册的主域名 */
  const SECOND_LEVEL = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
    'com.hk', 'net.hk', 'org.hk', 'edu.hk', 'gov.hk', 'com.tw', 'net.tw', 'org.tw', 'edu.tw', 'gov.tw', 'com.mo',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'co.nz', 'net.nz', 'org.nz',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'co.kr', 'or.kr', 'ac.kr', 'go.kr',
    'com.sg', 'net.sg', 'org.sg', 'edu.sg', 'gov.sg', 'com.my', 'co.id', 'com.vn', 'com.ph', 'co.th', 'in.th',
    'co.in', 'net.in', 'org.in', 'com.pk', 'com.sa', 'co.il', 'com.tr', 'com.eg', 'com.ng', 'co.za',
    'com.br', 'net.br', 'org.br', 'gov.br', 'com.mx', 'com.ar', 'com.ru', 'com.ua',
  ]);

  /** 子域名 → 可注册的主域名（www.bbc.co.uk → bbc.co.uk） */
  function registrable(host) {
    const labels = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (labels.length <= 2) return labels.join('.');
    return SECOND_LEVEL.has(labels.slice(-2).join('.')) ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
  }

  const settle = (p) => p.then((v) => v, () => null);

  /** ASN 资料：RIPEstat 概览与宣告前缀、PeeringDB、RDAP */
  async function asnInfo(asn) {
    const n = String(asn).replace(/^as/i, '');
    const [ov, pfx, pdb, rd] = await Promise.all([
      settle(util.request(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${n}`, { timeout: TIMEOUT })),
      settle(util.request(`https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${n}`, { timeout: 25000 })),
      SafeIP.risk.peeringdb(n),
      settle(lookup('autnum', n)),
    ]);
    const o = ov && ov.data && ov.data.data;
    const prefixes = ((pfx && pfx.data && pfx.data.data && pfx.data.data.prefixes) || []).map((p) => p.prefix);
    return {
      asn: n,
      holder: o ? o.holder : '',
      announced: o ? !!o.announced : null,
      block: o && o.block ? o.block.desc : '',
      v4: prefixes.filter((p) => !p.includes(':')),
      v6: prefixes.filter((p) => p.includes(':')),
      prefixesLoaded: !!pfx,
      pdb,
      rdap: rd,
      ok: !!(o || pdb || rd),
    };
  }

  SafeIP.whois = { rdap, lookup, parseDomain, parseNetwork, parseAutnum, registrable, asnInfo };
})(typeof window !== 'undefined' ? window : globalThis);

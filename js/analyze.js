/* SafeIP · analyze.js — 纯逻辑：出口分组、分流结论、泄露判定、IP 类型、文本报告（无 I/O、无 DOM） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const INTL_GROUPS = ['intl', 'site'];
  /** ChatGPT / Claude 等 AI 服务普遍不支持的地区（仅作提示） */
  const AI_RESTRICTED = new Set(['CN', 'HK', 'MO', 'RU', 'BY', 'IR', 'KP', 'SY', 'CU']);

  /**
   * 出口分组。results: [{ id, name, group, ok, ip, family }]
   * order: Map(ip → 序号)，由调用方按"首次出现"维护，保证出口字母与颜色稳定；未登记的 IP 会被追加进去。
   */
  function exits(results, order = new Map()) {
    const map = new Map();
    results.forEach((r) => {
      if (!r.ok) return;
      if (!order.has(r.ip)) order.set(r.ip, order.size);
      let e = map.get(r.ip);
      if (!e) {
        e = { ip: r.ip, family: r.family, index: order.get(r.ip), sources: [], groups: {} };
        map.set(r.ip, e);
      }
      e.sources.push({ id: r.id, name: r.name, group: r.group });
      e.groups[r.group] = (e.groups[r.group] || 0) + 1;
    });
    return [...map.values()]
      .sort((a, b) => (a.family === b.family ? a.index - b.index : a.family === 'v4' ? -1 : 1))
      .map((e) => ({ ...e, label: LETTERS[e.index] || String(e.index + 1) }));
  }

  /** 指定分组中出现次数最多的 IPv4；平票取结果列表中靠前者 */
  function mainExit(results, groups) {
    const counts = new Map();
    results.forEach((r) => {
      if (r.ok && r.family === 'v4' && groups.includes(r.group)) counts.set(r.ip, (counts.get(r.ip) || 0) + 1);
    });
    let best = null;
    let bestN = 0;
    counts.forEach((n, ip) => {
      if (n > bestN) {
        best = ip;
        bestN = n;
      }
    });
    return best;
  }

  /** 分流判定（只看 IPv4） */
  function routing(results) {
    const v4 = new Set(results.filter((r) => r.ok && r.family === 'v4').map((r) => r.ip));
    const cnExit = mainExit(results, ['cn']);
    const intlExit = mainExit(results, INTL_GROUPS);
    const count = v4.size;
    const status = count === 0 ? 'none' : count === 1 ? 'single' : 'split';
    const exceptions = [];
    if (status === 'split') {
      results.forEach((r) => {
        if (!r.ok || r.family !== 'v4') return;
        const expected = r.group === 'cn' ? cnExit : INTL_GROUPS.includes(r.group) ? intlExit : null;
        if (expected && r.ip !== expected) {
          exceptions.push({ id: r.id, name: r.name, group: r.group, ip: r.ip, expected });
        }
      });
    }
    return {
      status, count, cnExit, intlExit, exceptions,
      sameMain: status === 'split' && !!cnExit && cnExit === intlExit,
    };
  }

  const IDENT_TYPES = {
    hosting: ['hosting', '机房 / IDC'],
    isp: ['residential', '运营商宽带'],
    residential: ['residential', '家庭宽带'],
    business: ['business', '企业 / 商业宽带'],
    education: ['education', '教育网'],
    government: ['government', '政府网络'],
    mobile: ['mobile', '移动网络'],
  };
  const HOSTING_RE = /\b(amazon|aws|google|microsoft|azure|alibaba|aliyun|tencent|oracle|digitalocean|linode|akamai|vultr|choopa|constant company|ovh|hetzner|contabo|leaseweb|m247|cloudflare|zenlayer|it7|bandwagon|dmit|hostinger|kamatera|hosthatch|greencloud|racknerd|colocrossing|psychz|quadranet|multacom|datacamp|cdn77|g-core|gcore|fastly|scaleway|ionos|hostwinds|buyvm|frantech|sharktech|data ?cent(er|re)|hosting|server|vps|idc|cloud)\b/i;
  const ISP_RE = /(telecom|unicom|chinanet|cmnet|china mobile|broadband|comcast|verizon|at&t|charter|spectrum|telstra|optus|vodafone|orange|ntt|kddi|softbank|chunghwa|hinet|pccw|hkbn|singtel|starhub|deutsche telekom|telefonica|电信|联通|移动|铁通|广电|宽带)/i;

  /** IP 类型：ip-api 正向标记 > ident.me 类型 > ASN/ISP 关键词推测 > ip-api 负向标记 > 未知 */
  function classifyIP(geo, identType) {
    const g = geo || {};
    const f = g.flags;
    if (f && f.proxy) return { kind: 'proxy', label: '代理 / VPN', basis: 'ip-api' };
    if (f && f.hosting) return { kind: 'hosting', label: '机房 / IDC', basis: 'ip-api' };
    if (f && f.mobile) return { kind: 'mobile', label: '移动网络', basis: 'ip-api' };
    const t = String(identType || '').toLowerCase();
    if (t) {
      const m = IDENT_TYPES[t];
      return { kind: m ? m[0] : 'other', label: m ? m[1] : identType, basis: 'ident.me' };
    }
    const text = [g.asnName, g.isp].filter(Boolean).join(' ');
    if (HOSTING_RE.test(text)) return { kind: 'hosting', label: '机房 / IDC', basis: '推测' };
    if (ISP_RE.test(text)) return { kind: 'residential', label: '运营商宽带', basis: '推测' };
    if (f) return { kind: 'residential', label: '宽带 / 企业网络', basis: 'ip-api' };
    return { kind: 'unknown', label: '未知', basis: '' };
  }

  const typeText = (t) => (t.basis ? `${t.label}（${t.basis}）` : t.label);

  /** WebRTC 判定。rtcResults 为 null 表示尚未全部完成 */
  function webrtcVerdict(rtcResults, route, v6Exits = []) {
    if (!rtcResults || !rtcResults.length) return { status: 'pending' };
    if (rtcResults.every((r) => r.error === 'unsupported')) return { status: 'unsupported' };
    const ips = [...new Set(rtcResults.flatMap((r) => r.publicIPs || []))];
    if (!ips.length) return { status: 'blocked' };
    const leaked = [];
    let comparable = false;
    ips.forEach((ip) => {
      if (util.ipFamily(ip) === 'v4') {
        if (!route.intlExit) return;
        comparable = true;
        if (ip !== route.intlExit) leaked.push({ ip, isCnExit: ip === route.cnExit });
      } else {
        comparable = true;
        if (!v6Exits.includes(ip)) leaked.push({ ip, isCnExit: false });
      }
    });
    if (leaked.length) return { status: 'leak', ips, leaked };
    if (!comparable) return { status: 'unknown', ips };
    return { status: 'safe', ips };
  }

  /** DNS 判定：解析服务器所在国家 ≠ 国外主出口所在国家 → 存在泄露风险。geoOf(ip) 未就绪时返回 undefined */
  function dnsVerdict(dns, route, geoOf) {
    if (!dns) return { status: 'pending' };
    if (!dns.resolvers.length) return { status: 'unknown', reason: 'noresult' };
    const exitGeo = route.intlExit ? geoOf(route.intlExit) : null;
    if (!exitGeo || !exitGeo.cc) return { status: 'unknown', reason: route.intlExit ? 'nogeo' : 'noexit' };
    const withCC = dns.resolvers.map((r) => ({ ...r, cc: (geoOf(r.ip) || {}).cc || '' }));
    const foreign = withCC.filter((r) => r.cc && r.cc !== exitGeo.cc);
    if (foreign.length) return { status: 'leak', exitCC: exitGeo.cc, resolvers: foreign };
    if (withCC.some((r) => !r.cc)) return { status: 'unknown', reason: 'nogeo' };
    return { status: 'safe', exitCC: exitGeo.cc };
  }

  const aiRegionRestricted = (cc) => AI_RESTRICTED.has(String(cc || '').toUpperCase());

  /** AI 站点的地区判定汇总。rows: [{ name, ai, result }]，result 未完成时为 undefined */
  function aiVerdict(rows) {
    const ai = rows.filter((r) => r.ai);
    if (!ai.length) return { status: 'none' };
    const done = ai.filter((r) => r.result);
    const ok = done.filter((r) => r.result.ok && r.result.cc);
    const restricted = ok
      .filter((r) => aiRegionRestricted(r.result.cc))
      .map((r) => ({ name: r.name, cc: r.result.cc }));
    if (restricted.length) return { status: 'restricted', restricted };
    if (done.length < ai.length) return { status: 'pending' };
    if (!ok.length) return { status: 'failed' };
    return { status: 'ok', ccs: [...new Set(ok.map((r) => r.result.cc))] };
  }

  /** 连通性分级：优先用复用延迟（近似 RTT） */
  function latencyGrade(r) {
    if (!r || !r.ok) return 'fail';
    const ms = r.reuse != null ? r.reuse : r.first;
    return ms < 150 ? 'fast' : ms < 400 ? 'ok' : 'slow';
  }
  const GRADE_TEXT = { fast: '快', ok: '一般', slow: '慢', fail: '不可达' };

  // ---------------- 文案（页面与报告共用） ----------------

  function verdictText(route) {
    if (route.status === 'none') return '检测失败：所有服务均无法访问';
    if (route.status === 'single') return '单一出口：所有服务看到同一个 IP';
    return `已分流：检测到 ${route.count} 个 IPv4 出口`;
  }

  /** labelOf(ip) → 出口字母（不是 HTTP 出口时返回空串） */
  function webrtcText(v, fmt, labelOf = () => '') {
    switch (v.status) {
      case 'pending': return '检测中…';
      case 'unsupported': return '浏览器不支持 WebRTC，网站无法借此获取你的 IP';
      case 'blocked': return '未获取到公网地址（WebRTC 被禁用或 UDP 不通），网站无法借此获取你的 IP';
      case 'unknown': return `STUN 看到 ${v.ips.map(fmt).join('、')}，暂无国外出口可供对比`;
      case 'safe': return 'UDP 出口与国外出口一致，未发现泄露';
      default: return `网站可通过 WebRTC 获取 ${v.leaked.map((l) => {
        const label = labelOf(l.ip);
        const notes = [label && `出口 ${label}`, l.isCnExit && '国内主出口，通常就是你的真实 IP'].filter(Boolean);
        return fmt(l.ip) + (notes.length ? `（${notes.join('，')}）` : '');
      }).join('、')}，与国外出口不同`;
    }
  }

  function dnsText(v) {
    const name = util.countryName;
    switch (v.status) {
      case 'pending': return '检测中…';
      case 'unknown': return v.reason === 'noresult' ? '未能获取到 DNS 解析服务器' : '等待归属地数据…';
      case 'safe': return `解析服务器与国外出口同在${name(v.exitCC)}，未发现泄露`;
      default: return `国外出口位于${name(v.exitCC)}，但 DNS 由${[...new Set(v.resolvers.map((r) => name(r.cc)))].join('、')}的服务器解析，存在泄露风险`;
    }
  }

  const asnText = (g) => (g && g.asn ? `AS${g.asn}${g.asnName ? ' ' + g.asnName : ''}` : '');
  const geoText = (g) => (g ? [g.location, g.isp, asnText(g)].filter(Boolean).join(' · ') : '');

  /**
   * 纯文本报告。s: { time, groups, sources: [{ meta, result }], exits, route, geoOf, typeOf,
   *   rtc: [{ server, result }], rtcVerdict, dns, dnsVerdict, conn: [{ site, result }], fmt }
   */
  function report(s) {
    const L = [];
    const { fmt } = s;
    const t = s.time;
    const pad = (n) => String(n).padStart(2, '0');
    L.push(`SafeIP 检测报告 · ${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`);
    L.push('');
    L.push(`【结论】${verdictText(s.route)}`);
    s.exits.forEach((e) => {
      const g = s.geoOf(e.ip);
      const fam = e.family === 'v6' ? ' [IPv6]' : '';
      L.push(`  出口 ${e.label}${fam}  ${fmt(e.ip)}  ${geoText(g)}  类型：${typeText(s.typeOf(e.ip))}`);
      L.push(`      看到它的服务（${e.sources.length}）：${e.sources.map((x) => x.name).join('、')}`);
    });
    if (s.route.exceptions.length) {
      L.push(`  例外：${s.route.exceptions.map((x) => `${x.name}（${s.groups[x.group].title}）`).join('、')}`);
    }
    const labelOf = (ip) => (s.exits.find((e) => e.ip === ip) || {}).label || '';
    L.push(`【WebRTC】${webrtcText(s.rtcVerdict, fmt, labelOf)}`);
    L.push(`【DNS】${dnsText(s.dnsVerdict)}`);
    if (s.dns) {
      s.dns.resolvers.forEach((r) => L.push(`  ${fmt(r.ip)}  ${geoText(s.geoOf(r.ip)) || r.hint}`));
    }
    (s.extra || []).forEach((line) => L.push(line));

    Object.keys(s.groups).forEach((gid) => {
      const rows = s.sources.filter((x) => x.meta.group === gid);
      if (!rows.length) return;
      L.push('');
      L.push(`[${s.groups[gid].title}]`);
      rows.forEach(({ meta, result: r }) => {
        if (!r) L.push(`  ${meta.name}：检测中`);
        else if (!r.ok) L.push(`  ${meta.name}：${util.errorText(r.error)}`);
        else {
          const site = r.extra && r.extra.loc ? `  站点判定 ${r.extra.loc}${r.extra.colo ? ' · ' + r.extra.colo : ''}` : '';
          L.push(`  ${meta.name}：${fmt(r.ip)}${site}  ${r.ms} ms`);
        }
      });
    });

    if (s.rtc && s.rtc.length) {
      L.push('');
      L.push('[WebRTC / STUN]');
      s.rtc.forEach(({ server, result: r }) => {
        const v = !r ? '检测中' : r.ok ? r.publicIPs.map(fmt).join('、') : util.errorText(r.error);
        L.push(`  ${server.name}（${server.url.replace(/^stun:/, '')}）：${v}`);
      });
    }

    if (s.conn && s.conn.length) {
      L.push('');
      L.push('[网站连通性]');
      ['cn', 'intl'].forEach((gid) => {
        const rows = s.conn.filter((x) => x.site.group === gid);
        const parts = rows.map(({ site, result: r }) => {
          if (!r) return `${site.name} 检测中`;
          if (!r.ok) return `${site.name} 不可达`;
          return `${site.name} ${r.reuse != null ? r.reuse : r.first}ms`;
        });
        L.push(`  ${gid === 'cn' ? '国内' : '国外'}：${parts.join('、')}`);
      });
    }
    return L.join('\n');
  }

  SafeIP.analyze = {
    exits, routing, classifyIP, typeText, webrtcVerdict, dnsVerdict, aiRegionRestricted, aiVerdict,
    latencyGrade, GRADE_TEXT, verdictText, webrtcText, dnsText, asnText, geoText, report,
  };
})(typeof window !== 'undefined' ? window : globalThis);

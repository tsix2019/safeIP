const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/analyze.js');

const { analyze } = globalThis.SafeIP;
const { CN_IP, INTL_IP, V6_IP, RESOLVER } = require('./fixtures');

const ok = (id, group, ip, family = 'v4') => ({ id, name: id, group, ok: true, ip, family });
const fail = (id, group) => ({ id, name: id, group, ok: false, error: 'timeout' });

/** 理想分流：国内服务全走国内出口，国外 / 网站全走海外出口 */
const cleanSplit = [
  ok('ipip', 'cn', CN_IP), ok('upyun', 'cn', CN_IP), ok('qqvideo', 'cn', CN_IP),
  ok('cloudflare', 'intl', INTL_IP), ok('ipsb', 'intl', INTL_IP), ok('chatgpt', 'site', INTL_IP),
  fail('ipinfo', 'intl'),
];

/** 典型"规则没覆盖"：大部分国内服务也走了海外出口，只有少数直连 */
const leakySplit = [
  ok('ipip', 'cn', INTL_IP), ok('upyun', 'cn', INTL_IP), ok('netease', 'cn', INTL_IP), ok('qqvideo', 'cn', CN_IP),
  ok('cloudflare', 'intl', INTL_IP), ok('ipsb', 'intl', INTL_IP), ok('chatgpt', 'site', INTL_IP), ok('npm', 'site', CN_IP),
];

test('routing：理想分流', () => {
  const r = analyze.routing(cleanSplit);
  assert.equal(r.status, 'split');
  assert.equal(r.count, 2);
  assert.equal(r.cnExit, CN_IP);
  assert.equal(r.intlExit, INTL_IP);
  assert.equal(r.sameMain, false);
  assert.deepEqual(r.exceptions, []);
});

test('routing：主出口相同，识别例外服务', () => {
  const r = analyze.routing(leakySplit);
  assert.equal(r.status, 'split');
  assert.equal(r.cnExit, INTL_IP);
  assert.equal(r.intlExit, INTL_IP);
  assert.equal(r.sameMain, true);
  assert.deepEqual(r.exceptions.map((x) => x.id), ['qqvideo', 'npm']);
  assert.equal(r.exceptions[0].expected, INTL_IP);
});

test('routing：单一出口 / 全部失败 / 忽略 IPv6', () => {
  const single = analyze.routing([ok('a', 'cn', INTL_IP), ok('b', 'intl', INTL_IP), ok('c', 'v6', V6_IP, 'v6')]);
  assert.equal(single.status, 'single');
  assert.deepEqual(single.exceptions, []);
  assert.equal(analyze.routing([fail('a', 'cn')]).status, 'none');
});

test('routing：平票时取靠前的服务', () => {
  const r = analyze.routing([ok('a', 'cn', CN_IP), ok('b', 'cn', INTL_IP)]);
  assert.equal(r.cnExit, CN_IP);
});

test('exits：按首次出现编号，字母稳定，IPv6 排后', () => {
  const order = new Map([[INTL_IP, 0]]);
  const list = analyze.exits([...cleanSplit, ok('ipify6', 'v6', V6_IP, 'v6')], order);
  assert.deepEqual(list.map((e) => [e.ip, e.label]), [[INTL_IP, 'A'], [CN_IP, 'B'], [V6_IP, 'C']]);
  const cn = list.find((e) => e.ip === CN_IP);
  assert.deepEqual(cn.groups, { cn: 3 });
  assert.equal(cn.sources.length, 3);
  assert.equal(order.get(V6_IP), 2);
});

test('webrtcVerdict：泄露 / 安全 / 被禁用 / 不支持 / 等待', () => {
  const route = analyze.routing(cleanSplit);
  const leak = analyze.webrtcVerdict([{ publicIPs: [CN_IP] }, { publicIPs: [CN_IP] }], route);
  assert.equal(leak.status, 'leak');
  assert.deepEqual(leak.leaked, [{ ip: CN_IP, isCnExit: true }]);

  assert.equal(analyze.webrtcVerdict([{ publicIPs: [INTL_IP] }], route).status, 'safe');
  assert.equal(analyze.webrtcVerdict([{ publicIPs: [], error: 'timeout' }], route).status, 'blocked');
  assert.equal(analyze.webrtcVerdict([{ publicIPs: [], error: 'unsupported' }], route).status, 'unsupported');
  assert.equal(analyze.webrtcVerdict(null, route).status, 'pending');

  // IPv6 公网候选不在 HTTP 检测到的 IPv6 出口中 → 泄露
  assert.equal(analyze.webrtcVerdict([{ publicIPs: [V6_IP] }], route, []).status, 'leak');
  assert.equal(analyze.webrtcVerdict([{ publicIPs: [V6_IP] }], route, [V6_IP]).status, 'safe');
  // 还没有国外出口可对比
  assert.equal(analyze.webrtcVerdict([{ publicIPs: [CN_IP] }], analyze.routing([])).status, 'unknown');
});

test('webrtcText：标注泄露的是哪个出口', () => {
  const route = analyze.routing(cleanSplit);
  const leak = analyze.webrtcVerdict([{ publicIPs: [CN_IP] }], route);
  const text = analyze.webrtcText(leak, (ip) => ip, (ip) => (ip === CN_IP ? 'B' : ''));
  assert.match(text, new RegExp(`${CN_IP}（出口 B，国内主出口，通常就是你的真实 IP）`));
  // 不在任何 HTTP 出口中的 IP 不加括注
  const other = analyze.webrtcVerdict([{ publicIPs: ['192.0.2.99'] }], route);
  assert.match(analyze.webrtcText(other, (ip) => ip), /获取 192\.0\.2\.99，与国外出口不同/);
});

test('dnsVerdict：泄露 / 安全 / 等待归属地', () => {
  const route = analyze.routing(cleanSplit);
  const geo = new Map([[INTL_IP, { cc: 'US' }], [RESOLVER, { cc: 'CN' }]]);
  const geoOf = (ip) => geo.get(ip);
  const dnsData = { resolvers: [{ ip: RESOLVER, via: ['ipleak'] }] };

  const leak = analyze.dnsVerdict(dnsData, route, geoOf);
  assert.equal(leak.status, 'leak');
  assert.equal(leak.exitCC, 'US');
  assert.equal(leak.resolvers[0].cc, 'CN');
  assert.match(analyze.dnsText(leak), /美国.*中国.*泄露风险/);

  geo.set(RESOLVER, { cc: 'US' });
  assert.equal(analyze.dnsVerdict(dnsData, route, geoOf).status, 'safe');

  assert.equal(analyze.dnsVerdict(dnsData, route, () => undefined).reason, 'nogeo');
  assert.equal(analyze.dnsVerdict({ resolvers: [] }, route, geoOf).reason, 'noresult');
  assert.equal(analyze.dnsVerdict(null, route, geoOf).status, 'pending');
});

test('classifyIP：优先级', () => {
  const flags = (o) => ({ hosting: false, proxy: false, mobile: false, ...o });
  assert.equal(analyze.classifyIP({ flags: flags({ proxy: true, hosting: true }) }).kind, 'proxy');
  assert.equal(analyze.classifyIP({ flags: flags({ hosting: true }) }).kind, 'hosting');
  assert.equal(analyze.classifyIP({ flags: flags({ mobile: true }) }).kind, 'mobile');
  assert.deepEqual(analyze.classifyIP({}, 'business'), { kind: 'business', label: '企业 / 商业宽带', basis: 'ident.me' });
  assert.equal(analyze.classifyIP({ asnName: 'DigitalOcean, LLC' }).basis, '推测');
  assert.equal(analyze.classifyIP({ asnName: 'DigitalOcean, LLC' }).kind, 'hosting');
  assert.equal(analyze.classifyIP({ isp: '电信' }).kind, 'residential');
  assert.equal(analyze.classifyIP({ isp: 'Example Net', flags: flags({}) }).label, '宽带 / 企业网络');
  assert.equal(analyze.classifyIP(undefined).kind, 'unknown');
  assert.equal(analyze.typeText(analyze.classifyIP({ isp: '联通' })), '运营商宽带（推测）');
});

test('aiRegionRestricted 与 latencyGrade', () => {
  assert.equal(analyze.aiRegionRestricted('hk'), true);
  assert.equal(analyze.aiRegionRestricted('JP'), false);
  assert.equal(analyze.latencyGrade({ ok: true, first: 900, reuse: 80 }), 'fast');
  assert.equal(analyze.latencyGrade({ ok: true, first: 300, reuse: null }), 'ok');
  assert.equal(analyze.latencyGrade({ ok: true, first: 500, reuse: 450 }), 'slow');
  assert.equal(analyze.latencyGrade({ ok: false }), 'fail');
});

test('report：包含结论与明细，打码时不出现完整 IP', () => {
  const route = analyze.routing(leakySplit);
  const exits = analyze.exits(leakySplit);
  const groups = {
    cn: { title: '国内服务' }, intl: { title: '国外服务' }, site: { title: '网站视角' }, v6: { title: 'IPv6' },
  };
  const rows = leakySplit.map((r) => ({ meta: { id: r.id, name: r.name, group: r.group }, result: { ...r, ms: 10, extra: {} } }));
  const state = {
    time: new Date(2026, 9, 2, 8, 5), groups, sources: rows, exits, route,
    geoOf: () => ({ location: '示例地点', isp: 'Example Net', asn: 64500, asnName: 'EXAMPLE', cc: 'US' }),
    typeOf: () => ({ label: '机房 / IDC', basis: '推测' }),
    rtc: [{ server: { name: 'Google', url: 'stun:stun.l.google.com:19302' }, result: { ok: true, publicIPs: [CN_IP] } }],
    rtcVerdict: analyze.webrtcVerdict([{ publicIPs: [CN_IP] }], route),
    dns: { resolvers: [{ ip: RESOLVER, hint: 'x', via: ['ipleak'] }] },
    dnsVerdict: { status: 'pending' },
    conn: [{ site: { name: '百度', group: 'cn' }, result: { ok: true, first: 50, reuse: 20 } }],
  };

  const plain = analyze.report({ ...state, fmt: (ip) => ip });
  assert.match(plain, /^SafeIP 检测报告 · 2026-10-02 08:05/);
  assert.match(plain, /已分流：检测到 2 个 IPv4 出口/);
  assert.match(plain, /例外：qqvideo（国内服务）、npm（网站视角）/);
  assert.match(plain, /AS64500 EXAMPLE/);
  assert.match(plain, /百度 20ms/);
  assert.ok(plain.includes(CN_IP));

  const masked = analyze.report({ ...state, fmt: (ip) => globalThis.SafeIP.util.maskIP(ip) });
  for (const ip of [CN_IP, INTL_IP, RESOLVER]) assert.ok(!masked.includes(ip), `报告泄露了 ${ip}`);
  assert.ok(masked.includes('198.51.*.*'));
});

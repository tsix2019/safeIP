// v2 新增模块的纯逻辑测试（夹具均为手工构造的示例数据，IP 使用 RFC 5737 文档地址）
const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/sources.js');
require('../js/geo.js');
require('../js/connectivity.js');
require('../js/analyze.js');
require('../js/risk.js');
require('../js/whois.js');
require('../js/gping.js');
require('../js/svcstatus.js');
require('../js/fingerprint.js');
require('../js/china.js');

const { util, analyze, risk, whois, gping, svcstatus, fp, china, connectivity } = globalThis.SafeIP;

test('util.normalizeHost：去协议路径端口、转 punycode、拒绝非法输入', () => {
  assert.equal(util.normalizeHost('https://WWW.Example.com:8443/path?q=1'), 'www.example.com');
  assert.equal(util.normalizeHost(' example.com. '), 'example.com');
  assert.equal(util.normalizeHost('203.0.113.7'), '203.0.113.7');
  assert.equal(util.normalizeHost('[2001:db8::1]'), '2001:db8::1');
  assert.equal(util.normalizeHost('http://[2001:db8::1]:80/'), '2001:db8::1');
  assert.equal(util.normalizeHost('例子.测试'), 'xn--fsqu00a.xn--0zwm56d');
  for (const bad of ['', 'localhost', 'not a host', '-bad.com', 'a..b']) assert.equal(util.normalizeHost(bad), '', bad);
});

test('util.hash 与 reverseV4', () => {
  assert.equal(util.hash('abc'), util.hash('abc'));
  assert.notEqual(util.hash('abc'), util.hash('abd'));
  assert.match(util.hash(''), /^[0-9a-f]{16}$/);
  assert.equal(util.reverseV4('203.0.113.7'), '7.113.0.203');
});

test('util.doh：优先 dns.google，失败回退 cloudflare-dns.com', async () => {
  const original = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (url) => {
      seen.push(url);
      if (url.startsWith('https://dns.google')) throw new TypeError('blocked');
      return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '192.0.2.1' }] }) };
    };
    const r = await util.doh('example.com', 'A');
    assert.equal(r.status, 0);
    assert.deepEqual(r.answers.map((a) => a.data), ['192.0.2.1']);
    assert.equal(seen.length, 2);
    assert.match(seen[1], /^https:\/\/cloudflare-dns\.com\/dns-query\?name=example\.com&type=A$/);
  } finally {
    globalThis.fetch = original;
  }
});

test('connectivity.median', () => {
  assert.equal(connectivity.median([]), null);
  assert.equal(connectivity.median([30, 10, 20]), 20);
  assert.equal(connectivity.median([40, 10, 30, 20]), 20);
});

test('risk.parseDnsbl：上榜 / 未上榜 / 拒绝查询', () => {
  assert.equal(risk.parseDnsbl({ status: 3, answers: [] }), false);
  assert.equal(risk.parseDnsbl({ status: 0, answers: [] }), false);
  assert.equal(risk.parseDnsbl({ status: 0, answers: [{ type: 1, data: '127.0.0.2' }] }), true);
  assert.equal(risk.parseDnsbl({ status: 0, answers: [{ type: 1, data: '127.255.255.254' }] }), null);
  assert.equal(risk.parseDnsbl({ status: 2, answers: [] }), null);
});

test('risk.score：干净 IP、机房 + 广播、代理 + Tor + 黑名单封顶', () => {
  const clean = risk.score({ flags: { proxy: false, hosting: false, mobile: false }, kind: 'residential', asnType: 'Cable/DSL/ISP', rirCC: 'US', geoCC: 'US', dnsbl: [], sfs: { appears: false, frequency: 0 }, tor: { relay: false, exit: false } });
  assert.equal(clean.score, 0);
  assert.equal(clean.level, 'low');
  assert.equal(clean.native, true);

  const dc = risk.score({ flags: null, kind: 'unknown', asnType: 'Content', rirCC: 'US', geoCC: 'JP', dnsbl: [] });
  assert.equal(dc.score, 35);
  assert.equal(dc.level, 'medium');
  assert.deepEqual(dc.factors.map((f) => f.key), ['hosting', 'broadcast']);
  assert.equal(dc.native, false);

  const bad = risk.score({
    flags: { proxy: true, hosting: true }, kind: 'hosting', rirCC: '', geoCC: 'US',
    dnsbl: [{ name: 'A', listed: true }, { name: 'B', listed: true }, { name: 'C', listed: true }, { name: 'D', listed: true }, { name: 'T', listed: true, tor: true }],
    sfs: { appears: true, frequency: 40 }, tor: { relay: true, exit: true },
  });
  assert.equal(bad.score, 100);
  assert.equal(bad.level, 'critical');
  assert.equal(bad.factors.find((f) => f.key === 'dnsbl').points, 45);
  assert.equal(bad.factors.find((f) => f.key === 'sfs').points, 30);
  assert.equal(bad.native, null);
});

const vcard = (fn, email) => ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', fn], ...(email ? [['email', {}, 'text', email]] : [])]];

test('whois.parseDomain：注册商、嵌套 abuse 联系人、事件、NS、DNSSEC', () => {
  const d = whois.parseDomain({
    ldhName: 'EXAMPLE.COM', handle: 'D1', status: ['client transfer prohibited'],
    entities: [{
      roles: ['registrar'], vcardArray: vcard('Example Registrar, Inc.'), publicIds: [{ type: 'IANA Registrar ID', identifier: '9999' }],
      entities: [{ roles: ['abuse'], vcardArray: vcard('Abuse', 'abuse@registrar.example') }],
    }],
    events: [
      { eventAction: 'registration', eventDate: '2000-01-02T03:04:05Z' },
      { eventAction: 'expiration', eventDate: '2030-01-02T03:04:05Z' },
    ],
    nameservers: [{ ldhName: 'NS1.EXAMPLE.NET' }, { ldhName: 'NS2.EXAMPLE.NET' }],
    secureDNS: { delegationSigned: false },
  });
  assert.equal(d.name, 'example.com');
  assert.equal(d.registrar, 'Example Registrar, Inc.');
  assert.equal(d.registrarId, '9999');
  assert.equal(d.abuse, 'abuse@registrar.example');
  assert.equal(d.created, '2000-01-02T03:04:05Z');
  assert.equal(d.expires, '2030-01-02T03:04:05Z');
  assert.deepEqual(d.nameservers, ['ns1.example.net', 'ns2.example.net']);
  assert.equal(d.dnssec, false);
  assert.equal(d.registrant, '');
});

test('whois.parseNetwork 与 parseAutnum', () => {
  const n = whois.parseNetwork({
    handle: 'NET-203-0-113-0-1', name: 'EXAMPLE-NET', type: 'ASSIGNMENT', country: 'AU',
    startAddress: '203.0.113.0', endAddress: '203.0.113.255', cidr0_cidrs: [{ v4prefix: '203.0.113.0', length: 24 }],
    entities: [{ roles: ['registrant'], vcardArray: vcard('Example Org') }, { roles: ['abuse'], vcardArray: vcard('NOC', 'noc@example.net') }],
    port43: 'whois.example-rir.net',
  });
  assert.equal(n.cidr, '203.0.113.0/24');
  assert.equal(n.range, '203.0.113.0 – 203.0.113.255');
  assert.equal(n.org, 'Example Org');
  assert.equal(n.abuse, 'noc@example.net');
  assert.equal(n.source, 'whois.example-rir.net');

  const a = whois.parseAutnum({ handle: 'AS64500', name: 'EXAMPLE-AS', startAutnum: 64500, endAutnum: 64500, country: 'US' });
  assert.equal(a.range, 'AS64500');
  assert.equal(a.name, 'EXAMPLE-AS');
  assert.equal(whois.parseAutnum({ startAutnum: 64496, endAutnum: 64511 }).range, 'AS64496 – AS64511');
});

test('whois.registrable：子域名 → 可注册主域名', () => {
  assert.equal(whois.registrable('www.github.com'), 'github.com');
  assert.equal(whois.registrable('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(whois.registrable('www.example.com.cn'), 'example.com.cn');
  assert.equal(whois.registrable('example.com'), 'example.com');
  assert.equal(whois.registrable('io'), 'io');
});

test('gping.parseCheckHost：完成、测量中、无法解析、超时', () => {
  const nodes = {
    'jp1.node.example': ['jp', 'Japan', 'Tokyo', '192.0.2.10', 'AS64501'],
    'us1.node.example': ['us', 'USA', 'Los Angeles', '192.0.2.11', 'AS64502'],
    'de1.node.example': ['de', 'Germany', 'Frankfurt', '192.0.2.12', 'AS64503'],
    'br1.node.example': ['br', 'Brazil', 'Sao Paulo', '192.0.2.13', 'AS64504'],
  };
  const list = gping.parseCheckHost(nodes, {
    'jp1.node.example': [[['OK', 0.0105, '203.0.113.7'], ['OK', 0.0101], ['TIMEOUT', 3], ['OK', 0.0099]]],
    'us1.node.example': null,
    'de1.node.example': [null],
    'br1.node.example': [[['TIMEOUT', 3], ['TIMEOUT', 3]]],
  });
  const by = Object.fromEntries(list.map((x) => [x.id, x]));
  assert.equal(by['jp1.node.example'].status, 'ok');
  assert.deepEqual(by['jp1.node.example'].rtts, [10.5, 10.1, 9.9]);
  assert.equal(by['jp1.node.example'].loss, 25);
  assert.equal(by['jp1.node.example'].min, 9.9);
  assert.equal(by['jp1.node.example'].avg, 10.2);
  assert.equal(by['jp1.node.example'].cc, 'JP');
  assert.equal(by['us1.node.example'].status, 'pending');
  assert.equal(by['de1.node.example'].status, 'error');
  assert.equal(by['br1.node.example'].status, 'timeout');
  assert.equal(by['br1.node.example'].loss, 100);
  assert.equal(gping.parseCheckHost(nodes, null).every((x) => x.status === 'pending'), true);
});

test('gping.parseGlobalping', () => {
  const list = gping.parseGlobalping({
    status: 'finished',
    results: [
      { probe: { country: 'SG', city: 'Singapore', asn: 64505, network: 'Example' }, result: { status: 'finished', stats: { min: 2, avg: 2.5, max: 3, total: 4, loss: 0 }, timings: [{ rtt: 2 }, { rtt: 3 }] } },
      { probe: { country: 'FR', city: 'Paris' }, result: { status: 'finished', stats: { total: 4, loss: 100 }, timings: [] } },
      { probe: { country: 'US' }, result: { status: 'in-progress' } },
    ],
  });
  assert.deepEqual(list.map((x) => x.status), ['ok', 'timeout', 'pending']);
  assert.equal(list[0].asn, 'AS64505');
  assert.equal(list[0].avg, 2.5);
  assert.equal(list[1].loss, 100);
});

test('svcstatus.parseStatuspage 与 parseGcloud', () => {
  const s = svcstatus.parseStatuspage({
    page: { updated_at: '2026-01-01T00:00:00Z' },
    status: { indicator: 'minor', description: 'Minor Service Outage' },
    components: [
      { name: 'API', status: 'operational' },
      { name: 'Group', status: 'partial_outage', group: true },
      { name: 'Child', status: 'major_outage', group_id: 'g1' },
    ],
    incidents: [{ name: 'Elevated errors', status: 'investigating', impact: 'minor', shortlink: 'https://stspg.io/x', updated_at: '2026-01-01T00:00:00Z' }],
    scheduled_maintenances: [{ name: 'Done', status: 'completed' }, { name: 'Upcoming', status: 'scheduled', scheduled_for: '2026-02-01T00:00:00Z' }],
  }, 'https://status.example.com');
  assert.equal(s.st, 'warning');
  assert.equal(s.text, '部分服务受影响');
  assert.deepEqual(s.components.map((c) => c.name), ['API', 'Group']);
  assert.deepEqual(s.broken.map((c) => c.name), ['Group', 'Child']);
  assert.equal(s.incidents[0].status, '调查中');
  assert.deepEqual(s.maintenances.map((m) => m.name), ['Upcoming']);

  const ok = svcstatus.parseGcloud([{ end: '2026-01-01', severity: 'high' }]);
  assert.equal(ok.indicator, 'none');
  assert.equal(ok.st, 'good');
  const bad = svcstatus.parseGcloud([{ severity: 'high', external_desc: ' Gemini  API errors ', uri: 'incidents/abc', affected_products: [{ title: 'Vertex Gemini API' }] }]);
  assert.equal(bad.indicator, 'major');
  assert.equal(bad.incidents[0].name, 'Gemini API errors');
  assert.equal(bad.incidents[0].url, 'https://status.cloud.google.com/incidents/abc');
  assert.equal(bad.broken[0].name, 'Vertex Gemini API');
});

test('fp：时区 / 语言地区映射与一致性检查', () => {
  assert.equal(fp.tzCountry('Asia/Shanghai'), 'CN');
  assert.equal(fp.tzCountry('Mars/Base'), '');
  assert.equal(fp.langCountry('zh-CN'), 'CN');
  assert.equal(fp.langCountry('zh-Hans-CN'), 'CN');
  assert.equal(fp.langCountry('en-Latn-US'), 'US');
  assert.equal(fp.langCountry('zh-Hans'), '');

  const base = { timeZone: 'Asia/Shanghai', languages: ['zh-CN'], platform: 'Win32', ch: { platform: 'Windows' }, webdriver: false };
  const warn = fp.consistency(base, { exitCC: 'JP' });
  assert.deepEqual(warn.map((x) => x.st), ['warning', 'info']);
  assert.match(warn[0].detail, /日本/);

  const okList = fp.consistency({ ...base, timeZone: 'Asia/Tokyo', languages: ['ja-JP'] }, { exitCC: 'JP' });
  assert.deepEqual(okList.map((x) => x.st), ['good']);

  const spoof = fp.consistency({ ...base, platform: 'MacIntel', webdriver: true }, {});
  assert.deepEqual(spoof.map((x) => x.st), ['warning', 'critical']);
  // Android 设备的 navigator.platform 为 Linux，属于正常
  assert.equal(fp.consistency({ ...base, platform: 'Linux armv8l', ch: { platform: 'Android' } }, {}).length, 0);
});

test('china：信号与评分', () => {
  const full = china.signals({
    timeZone: 'Asia/Shanghai', languages: ['zh-CN'], fonts: ['Microsoft YaHei', 'Arial'],
    intlExitCC: 'US', exitCCs: ['CN', 'US'], webrtcCCs: ['CN'], dnsCCs: ['CN'], google: 'ok', baidu: 'ok',
  });
  const hits = full.filter((s) => s.hit).map((s) => s.key).sort();
  assert.deepEqual(hits, ['cnexit', 'dns', 'fonts', 'lang', 'tz', 'webrtc']);
  const r = china.evaluate(full);
  assert.equal(r.score, 85);
  assert.equal(r.level, 'high');
  assert.equal(r.complete, true);

  const abroad = china.evaluate(china.signals({
    timeZone: 'America/New_York', languages: ['en-US'], fonts: ['Arial'], intlExitCC: 'US', exitCCs: ['US'],
    webrtcCCs: ['US'], dnsCCs: ['US'], google: 'ok', baidu: 'ok',
  }));
  assert.equal(abroad.score, 0);
  assert.equal(abroad.level, 'low');

  const gfw = china.signals({ google: 'fail', baidu: 'ok' });
  assert.equal(gfw.find((s) => s.key === 'gfw').hit, true);
  assert.equal(china.evaluate(gfw).complete, false);
});

test('analyze.aiVerdict：受限 / 可用 / 检测中 / 失败', () => {
  const row = (name, cc, ok = true) => ({ name, ai: true, result: ok ? { ok: true, cc } : { ok: false } });
  assert.equal(analyze.aiVerdict([row('ChatGPT', 'US'), row('Claude', 'HK')]).status, 'restricted');
  assert.deepEqual(analyze.aiVerdict([row('ChatGPT', 'US'), row('Claude', 'US')]).ccs, ['US']);
  assert.equal(analyze.aiVerdict([row('ChatGPT', 'US'), { name: 'Claude', ai: true }]).status, 'pending');
  assert.equal(analyze.aiVerdict([row('ChatGPT', '', false)]).status, 'failed');
  assert.equal(analyze.aiVerdict([{ name: 'npm', ai: false, result: { ok: true, cc: 'CN' } }]).status, 'none');
});

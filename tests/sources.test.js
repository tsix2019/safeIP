const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');
require('../js/sources.js');
require('../js/geo.js');
require('../js/dns.js');
require('../js/webrtc.js');

const { util, sources, geo, dns, webrtc } = globalThis.SafeIP;
const { CN_IP, INTL_IP, V6_IP, RESOLVER, RESOLVER6, responses: R } = require('./fixtures');

const parse = (id, data) => sources.byId.get(id).parse(data);

test('检测源清单：id 唯一，字段齐全', () => {
  const ids = new Set();
  for (const s of sources.list) {
    assert.ok(!ids.has(s.id), `重复 id: ${s.id}`);
    ids.add(s.id);
    assert.ok(sources.GROUPS[s.group], `${s.id} 分组无效`);
    assert.ok(['json', 'text', 'jsonp', 'scriptvar'].includes(s.method), `${s.id} 方式无效`);
    assert.match(s.url, /^https:\/\//, `${s.id} 必须是 https`);
    if (s.method === 'jsonp') assert.ok(s.url.includes('{cb}'), `${s.id} 缺少 {cb}`);
    if (s.method === 'scriptvar') assert.ok(s.varName, `${s.id} 缺少 varName`);
  }
});

test('国内源解析', () => {
  assert.deepEqual(parse('ipip', R.ipip), { ip: CN_IP, location: '中国 上海', isp: '电信' });
  assert.equal(parse('ipip', R.ipipForeign).isp, 'example.net');
  assert.deepEqual(parse('upyun', R.upyun), { ip: INTL_IP, location: '美国 加利福尼亚州 洛杉矶', isp: '' });
  assert.deepEqual(parse('dnspod', R.dnspod), { ip: INTL_IP });
  assert.deepEqual(parse('netease', R.netease), {
    ip: INTL_IP, cc: 'US', location: '美国 加利福尼亚州 洛杉矶', isp: 'Example Net',
  });
  assert.deepEqual(parse('pconline', R.pconline), { ip: CN_IP, location: '上海市', isp: '电信' });
  assert.deepEqual(parse('pconline', R.pconlineForeign), { ip: INTL_IP, location: '美国', isp: '' });
  assert.deepEqual(parse('qqvideo', R.qqvideo), { ip: CN_IP });
  assert.deepEqual(parse('zxinc', R.zxinc), { ip: INTL_IP, location: '美国 加利福尼亚州 洛杉矶', isp: 'Example Net' });
});

test('国外源与网站视角解析', () => {
  const cf = parse('cloudflare', R.trace);
  assert.equal(cf.ip, INTL_IP);
  assert.equal(cf.cc, 'US');
  assert.deepEqual(cf.extra, { loc: 'US', colo: 'LAX', warp: 'off' });
  assert.equal(parse('chatgpt', R.trace).ip, INTL_IP);
  assert.equal(sources.byId.get('chatgpt').ai, true);
  assert.equal(sources.byId.get('npm').ai, false);

  const sb = parse('ipsb', R.ipsb);
  assert.equal(sb.ip, INTL_IP);
  assert.equal(sb.cc, 'US');
  assert.deepEqual(sb.extra, { asn: 64500, asnName: 'Example Net LLC' });

  assert.equal(parse('ipinfo', R.ipinfo).isp, 'AS64500 Example Net LLC');
  assert.equal(parse('ipwhois', R.ipwhois).isp, 'Example Net');
  assert.equal(parse('identme', R.identme).extra.type, 'hosting');
  assert.equal(parse('ipleak', R.ipleak).location, 'United States California Los Angeles');
  assert.equal(parse('ipsb6', R.ipsb6).ip, V6_IP);
});

test('run：成功、IP 非法、IPv6 组返回 IPv4、网络错误', async () => {
  const original = util.request;
  try {
    util.request = async () => ({ data: R.ipsb, ms: 12 });
    const ok = await sources.run(sources.byId.get('ipsb'));
    assert.equal(ok.ok, true);
    assert.equal(ok.family, 'v4');
    assert.equal(ok.ms, 12);

    util.request = async () => ({ data: { ip: '<img onerror=alert(1)>' }, ms: 5 });
    assert.equal((await sources.run(sources.byId.get('ipify'))).error, 'parse');

    util.request = async () => ({ data: { ip: INTL_IP }, ms: 5 });
    assert.equal((await sources.run(sources.byId.get('ipify6'))).error, 'family');

    util.request = async () => { throw util.makeError('timeout'); };
    assert.equal((await sources.run(sources.byId.get('ipinfo'))).error, 'timeout');
  } finally {
    util.request = original;
  }
});

test('geo.merge 按优先级合并字段并记录来源', () => {
  const g = geo.merge(CN_IP, {
    zxinc: { location: '中国 上海', isp: '电信' },
    ipsb: { cc: 'CN', locationEn: 'China Shanghai', isp: 'Example Telecom', asn: 64501, asnName: 'EXAMPLE-TELECOM' },
    ipapi: {
      cc: 'CN', location: '中国 上海市 上海', isp: 'Example Telecom', asn: 64501, asnName: 'EXAMPLE',
      flags: { hosting: false, proxy: false, mobile: false },
    },
  });
  assert.equal(g.location, '中国 上海');
  assert.equal(g.isp, '电信');
  assert.equal(g.cc, 'CN');
  assert.equal(g.asn, 64501);
  assert.equal(g.asnName, 'EXAMPLE-TELECOM');
  assert.deepEqual(g.flags, { hosting: false, proxy: false, mobile: false });
  assert.deepEqual(g.from, { location: 'ZXInc', asn: 'IP.SB', flags: 'ip-api' });

  const en = geo.merge(INTL_IP, { zxinc: null, ipsb: { cc: 'us', locationEn: 'United States Los Angeles' } });
  assert.equal(en.location, 'United States Los Angeles');
  assert.equal(en.cc, 'US');
  assert.equal(en.flags, null);

  const empty = geo.merge(INTL_IP, {});
  assert.equal(empty.location, '');
  assert.equal(empty.asn, null);
});

test('geo.lookup 限制并发、按 IP 缓存、失败时降级', async () => {
  const originalRequest = util.request;
  const originalJsonp = util.jsonp;
  let active = 0;
  let peak = 0;
  let calls = 0;
  try {
    util.jsonp = async () => { throw util.makeError('network'); };
    util.request = async (url) => {
      if (!url.includes('zxinc')) throw util.makeError('network');
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return { data: { code: 0, data: { country: '示例国家–示例城市', local: 'Example Net' } }, ms: 15 };
    };
    const ips = Array.from({ length: 8 }, (_, i) => `192.0.2.${100 + i}`);
    const results = await Promise.all(ips.map((ip) => geo.lookup(ip)));
    assert.equal(results[0].location, '示例国家 示例城市');
    assert.ok(peak <= 3, `并发峰值 ${peak} 超过上限`);
    assert.equal(calls, 8);

    await geo.lookup(ips[0]); // 命中缓存，不再请求
    assert.equal(calls, 8);
  } finally {
    util.request = originalRequest;
    util.jsonp = originalJsonp;
  }
});

test('dns.merge 合并去重并保留来源', () => {
  const out = dns.merge([
    { via: 'ip-api', value: { resolvers: [{ ip: RESOLVER, hint: 'Example Telecom' }], ecs: null } },
    { via: 'ip-api', value: { resolvers: [{ ip: RESOLVER, hint: '' }], ecs: { ip: '198.51.100.0', hint: 'x' } } },
    { via: 'ipleak', value: { resolvers: [{ ip: RESOLVER6, hint: '' }, { ip: RESOLVER, hint: '' }], ecs: null } },
    { via: 'ipleak', error: 'timeout' },
  ]);
  assert.equal(out.resolvers.length, 2);
  const r = out.resolvers.find((x) => x.ip === RESOLVER);
  assert.deepEqual(r.via, ['ip-api', 'ipleak']);
  assert.equal(r.hint, 'Example Telecom');
  assert.deepEqual(out.ecs, { ip: '198.51.100.0', hint: 'x' });
  assert.deepEqual(out.errors, [{ via: 'ipleak', error: 'timeout' }]);
});

test('webrtc.parseCandidate 解析 ICE 候选', () => {
  const srflx = webrtc.parseCandidate(`candidate:842163049 1 udp 1677729535 ${CN_IP} 51234 typ srflx raddr 0.0.0.0 rport 0 generation 0`);
  assert.deepEqual(srflx, { protocol: 'udp', address: CN_IP, port: 51234, type: 'srflx' });
  const host = webrtc.parseCandidate('a=candidate:1 1 UDP 2122260223 1b2c3d4e-0000-4000-8000-000000000000.local 54321 typ host');
  assert.equal(host.type, 'host');
  assert.equal(host.protocol, 'udp');
  assert.equal(webrtc.parseCandidate(''), null);
  assert.equal(webrtc.servers.length, 7);
});

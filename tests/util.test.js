const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/util.js');

const { util } = globalThis.SafeIP;

test('ipFamily 识别 IPv4 / IPv6 并拒绝非法输入', () => {
  assert.equal(util.ipFamily('203.0.113.7'), 'v4');
  assert.equal(util.ipFamily(' 203.0.113.7\n'), 'v4');
  assert.equal(util.ipFamily('2001:db8::1'), 'v6');
  assert.equal(util.ipFamily('::ffff:192.0.2.1'), 'v6');
  for (const bad of ['256.1.1.1', '1.2.3', '01.2.3.4x', '2001:db8:::1', 'abc', '', '<script>', undefined, null, 42]) {
    assert.equal(util.ipFamily(bad), null, String(bad));
  }
});

test('isPublicIP 排除私有、回环、链路本地、CGNAT、组播、ULA', () => {
  const cases = {
    '203.0.113.7': true, '172.32.0.1': true, '100.128.0.1': true, '2001:db8::1': true,
    '10.1.2.3': false, '172.16.5.4': false, '192.168.1.1': false, '100.64.0.1': false,
    '169.254.1.1': false, '127.0.0.1': false, '0.0.0.0': false, '224.0.0.1': false,
    'fe80::1': false, 'fd12:3456::1': false, '::1': false, 'ff02::1': false, 'abc.local': false,
  };
  for (const [ip, expected] of Object.entries(cases)) assert.equal(util.isPublicIP(ip), expected, ip);
});

test('parseTrace 解析 Cloudflare trace', () => {
  const t = util.parseTrace('fl=1\nip=203.0.113.7\r\nloc=US\ncolo=LAX\nuag=Mozilla/5.0 (a=b)\n\n');
  assert.equal(t.ip, '203.0.113.7');
  assert.equal(t.loc, 'US');
  assert.equal(t.colo, 'LAX');
  assert.equal(t.uag, 'Mozilla/5.0 (a=b)');
});

test('maskIP 打码', () => {
  assert.equal(util.maskIP('203.0.113.7'), '203.0.*.*');
  assert.equal(util.maskIP('2001:db8:1::7'), '2001:db8:****:****');
  assert.equal(util.maskIP('not-an-ip'), 'not-an-ip');
});

test('place 拼接地名并去重', () => {
  assert.equal(util.place('中国', '北京', '北京'), '中国 北京');
  assert.equal(util.place(' ', null, undefined, 'A '), 'A');
  assert.equal(util.place(), '');
  assert.equal(util.place('中国\t广东省', '中国\t广东省'), '中国 广东省');
  assert.equal(util.clean(' 中国电信\t业务平台 '), '中国电信 业务平台');
});

test('countryName 输出中文国家名', () => {
  assert.equal(util.countryName('us'), '美国');
  assert.equal(util.countryName('AU'), '澳大利亚');
  assert.equal(util.countryName(''), '');
});

test('randomLabel 长度与字符集', () => {
  const s = util.randomLabel(40);
  assert.equal(s.length, 40);
  assert.match(s, /^[a-z0-9]+$/);
  assert.notEqual(util.randomLabel(32), util.randomLabel(32));
});

test('pool 限制并发且保持结果顺序', async () => {
  let running = 0;
  let peak = 0;
  const out = await util.pool([30, 10, 20, 5, 15], 2, async (ms, i) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, ms));
    running--;
    return i;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
  assert.equal(peak, 2);
});

test('request 把各类失败归类为字符串错误码', async () => {
  const original = globalThis.fetch;
  const url = 'https://example.invalid/';
  try {
    // DOMException 的 code 是数字（AbortError = 20），不能原样透传
    globalThis.fetch = async () => { throw Object.assign(new Error('boom'), { code: 20 }); };
    await assert.rejects(util.request(url), (e) => e.code === 'network');

    globalThis.fetch = (u, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    await assert.rejects(util.request(url, { timeout: 20 }), (e) => e.code === 'timeout');

    globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
    await assert.rejects(util.request(url), (e) => e.code === 'http');

    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    await assert.rejects(util.request(url), (e) => e.code === 'parse');

    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '{"ip":"203.0.113.7"}' });
    const res = await util.request(url);
    assert.equal(res.data.ip, '203.0.113.7');
    assert.equal(typeof res.ms, 'number');
  } finally {
    globalThis.fetch = original;
  }
});

test('errorText 有中文兜底', () => {
  assert.equal(util.errorText('timeout'), '超时');
  assert.equal(util.errorText('whatever'), '失败');
});

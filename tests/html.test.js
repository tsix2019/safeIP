// index.html 的脚本加载方式与 SEO 元信息
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const tags = html.match(/<script\b[^>]*\ssrc=[^>]*>/g) || []; // 外部脚本（不含 JSON-LD 数据块）
const srcs = tags.map((t) => /\ssrc="([^"]+)"/.exec(t)[1]);
const attr = (re) => (re.exec(html) || [])[1];

test('脚本全部 defer 并放在 head（CSP meta 会让预加载失效，普通脚本会串行下载）', () => {
  assert.ok(tags.length > 0);
  for (const tag of tags) assert.match(tag, /\sdefer\b/, tag);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.equal((head.match(/<script\b[^>]*\ssrc=/g) || []).length, tags.length);
  // 第一个脚本在样式表之前：安全软件插在它前面的同步脚本就不用等样式表
  assert.ok(html.indexOf('<script') < html.indexOf('rel="stylesheet"'));
});

test('脚本引用完整：文件都存在，js/ 下每个文件都被引用，util.js 最先、app.js 最后', () => {
  for (const src of srcs) assert.ok(fs.existsSync(path.join(ROOT, src)), src);
  const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
  assert.deepEqual([...srcs].sort(), [...list('js'), ...list('js/pages')].sort());
  assert.equal(srcs[0], 'js/util.js');
  assert.equal(srcs[srcs.length - 1], 'js/app.js');
});

test('SEO：标题、描述、canonical、Open Graph 与图标文件齐全', () => {
  const canonical = attr(/<link rel="canonical" href="([^"]+)"/);
  assert.match(canonical, /^https:\/\/.+\/$/);
  assert.equal(attr(/<meta property="og:url" content="([^"]+)"/), canonical);
  assert.ok(attr(/<title>([^<]+)<\/title>/).length > 10);
  assert.ok(attr(/<meta name="description" content="([^"]+)"/).length > 40);
  for (const p of ['og:title', 'og:description', 'og:image']) assert.ok(attr(new RegExp(`<meta property="${p}" content="([^"]+)"`)), p);
  // og:image 必须是绝对地址，且指向仓库里真实存在的文件
  const og = attr(/<meta property="og:image" content="([^"]+)"/);
  assert.ok(og.startsWith(canonical), og);
  assert.ok(fs.existsSync(path.join(ROOT, og.slice(canonical.length))), og);
  for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, href)), href);
  }
  // 不执行 JS 的爬虫也能读到页面主题
  assert.match(html, /<h1\b[^>]*>[^<]*全球 IP 分流检测/);
});

test('SEO：JSON-LD 是合法 JSON，网址与 canonical 一致', () => {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(block, '缺少 JSON-LD');
  const data = JSON.parse(block[1]);
  assert.equal(data['@type'], 'WebApplication');
  assert.equal(data.url, attr(/<link rel="canonical" href="([^"]+)"/));
});

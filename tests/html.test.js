// index.html 的脚本加载方式
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const tags = html.match(/<script\b[^>]*>/g) || [];
const srcs = tags.map((t) => (/\ssrc="([^"]+)"/.exec(t) || [])[1]);

test('脚本全部 defer 并放在 head（CSP meta 会让预加载失效，普通脚本会串行下载）', () => {
  assert.ok(tags.length > 0);
  for (const tag of tags) assert.match(tag, /\sdefer\b/, tag);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.equal((head.match(/<script\b/g) || []).length, tags.length);
  // 第一个脚本在样式表之前：安全软件插在它前面的同步脚本就不用等样式表
  assert.ok(html.indexOf('<script') < html.indexOf('rel="stylesheet"'));
});

test('脚本引用完整：文件都存在，js/ 下每个文件都被引用，util.js 最先、app.js 最后', () => {
  for (const src of srcs) assert.ok(src && fs.existsSync(path.join(ROOT, src)), src);
  const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`);
  assert.deepEqual([...srcs].sort(), [...list('js'), ...list('js/pages')].sort());
  assert.equal(srcs[0], 'js/util.js');
  assert.equal(srcs[srcs.length - 1], 'js/app.js');
});

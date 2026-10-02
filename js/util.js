/* SafeIP · util.js — 网络请求与通用工具（加载时不触碰 DOM，可在 Node 中 require） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});

  const DEFAULT_TIMEOUT = 8000;
  const now = () => (root.performance ? root.performance.now() : Date.now());

  function makeError(code, message) {
    const err = new Error(message || code);
    err.code = code;
    return err;
  }

  /** fetch 封装：超时、禁缓存、不带 Cookie / Referer。失败抛出带 code 的 Error。 */
  async function request(url, { as = 'json', timeout = DEFAULT_TIMEOUT, method = 'GET', headers, body } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const t0 = now();
    try {
      let text;
      try {
        const res = await fetch(url, {
          method,
          headers,
          body,
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: ctrl.signal,
        });
        if (!res.ok) throw Object.assign(makeError('http', 'HTTP ' + res.status), { status: res.status });
        text = await res.text();
      } catch (e) {
        // 自己抛出的错误 code 是字符串；DOMException（如 AbortError）的 code 是数字，需要重新归类
        if (typeof e.code === 'string') throw e;
        throw makeError(ctrl.signal.aborted ? 'timeout' : 'network');
      }
      const ms = Math.round(now() - t0);
      if (as === 'text') return { data: text, ms };
      try {
        return { data: JSON.parse(text), ms };
      } catch (e) {
        throw makeError('parse');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  let jsonpSeq = 0;

  /** JSONP：url 中的 {cb} 会被替换为唯一的全局回调名。 */
  function jsonp(url, { timeout = DEFAULT_TIMEOUT } = {}) {
    return new Promise((resolve, reject) => {
      const name = '__safeip_cb_' + Date.now().toString(36) + '_' + jsonpSeq++;
      const script = document.createElement('script');
      const t0 = now();
      let done = false;
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.remove();
        // 超时后迟到的响应仍会调用回调：先换成空函数，稍后再删除，避免报错
        root[name] = function () {};
        setTimeout(() => { delete root[name]; }, 60000);
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(makeError('timeout'))), timeout);
      root[name] = (data) => {
        const ms = Math.round(now() - t0);
        finish(() => resolve({ data, ms }));
      };
      script.onload = () => finish(() => reject(makeError('parse'))); // 脚本执行完仍未回调
      script.onerror = () => finish(() => reject(makeError('network')));
      script.referrerPolicy = 'no-referrer';
      script.src = url.replace('{cb}', encodeURIComponent(name));
      document.head.appendChild(script);
    });
  }

  const varQueues = {};

  /** 加载一段会给全局变量赋值的脚本（如 QZOutputJson=...），读取后删除。同名变量串行。 */
  function scriptVar(url, varName, { timeout = DEFAULT_TIMEOUT } = {}) {
    const clear = () => {
      try { delete root[varName]; } catch (e) { root[varName] = undefined; }
    };
    const run = () => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const t0 = now();
      let done = false;
      const finish = (fn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.remove();
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(makeError('timeout'))), timeout);
      clear();
      script.onload = () => finish(() => {
        const data = root[varName];
        clear();
        if (data === undefined) reject(makeError('parse'));
        else resolve({ data, ms: Math.round(now() - t0) });
      });
      script.onerror = () => finish(() => reject(makeError('network')));
      script.referrerPolicy = 'no-referrer';
      script.src = url;
      document.head.appendChild(script);
    });
    const p = (varQueues[varName] || Promise.resolve()).then(run, run);
    varQueues[varName] = p.catch(() => {});
    return p;
  }

  const V4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

  function ipFamily(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (V4.test(s)) return 'v4';
    if (s.includes(':') && /^[0-9a-fA-F:.]+$/.test(s)) {
      try {
        new URL('http://[' + s + ']/');
        return 'v6';
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /** 是否为公网地址：排除私有、回环、链路本地、CGNAT、组播、ULA 等。 */
  function isPublicIP(ip) {
    const fam = ipFamily(ip);
    if (fam === 'v4') {
      const [a, b] = ip.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      return true;
    }
    if (fam === 'v6') {
      const first = parseInt(ip.trim().split(':')[0] || '0', 16);
      if (first === 0) return false; // ::、::1、IPv4 映射地址等
      if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
      if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 链路本地
      if ((first & 0xff00) === 0xff00) return false; // ff00::/8 组播
      return true;
    }
    return false;
  }

  /** 解析 Cloudflare /cdn-cgi/trace 的 k=v 文本。 */
  function parseTrace(text) {
    const out = {};
    String(text).split(/\r?\n/).forEach((line) => {
      const i = line.indexOf('=');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  /** 截图分享用打码：IPv4 保留前两段，IPv6 保留前两组。 */
  function maskIP(ip) {
    const fam = ipFamily(ip);
    if (fam === 'v4') return ip.split('.').slice(0, 2).join('.') + '.*.*';
    if (fam === 'v6') return ip.split(':').slice(0, 2).join(':') + ':****:****';
    return ip;
  }

  /** 合并连续空白（部分接口用 Tab 分隔字段） */
  const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

  /** 拼接地名：去空白、去重（如直辖市 "北京 北京"）。 */
  function place(...parts) {
    const out = [];
    parts.forEach((p) => {
      const s = clean(p);
      if (s && !out.includes(s)) out.push(s);
    });
    return out.join(' ');
  }

  let regionNames = null;
  try {
    regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
  } catch (e) { /* 旧环境不支持时直接显示国家代码 */ }

  /** 国家代码 → 中文国家名（如 AU → 澳大利亚） */
  function countryName(cc) {
    const code = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return code;
    try {
      return (regionNames && regionNames.of(code)) || code;
    } catch (e) {
      return code;
    }
  }

  function randomLabel(n) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint8Array(n);
    root.crypto.getRandomValues(buf);
    return Array.from(buf, (b) => chars[b % chars.length]).join('');
  }

  /** 等主线程空闲，最多等 timeout 毫秒；不支持 requestIdleCallback 时退化为短定时器 */
  const idle = (timeout = 1000) => new Promise((resolve) => {
    if (root.requestIdleCallback) root.requestIdleCallback(() => resolve(), { timeout });
    else setTimeout(resolve, 50);
  });

  /** 以固定并发数处理列表；worker 不应抛错。 */
  async function pool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runner = async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
    return results;
  }

  /**
   * DNS-over-HTTPS 查询（dns.google，失败回退 cloudflare-dns.com）。
   * 返回 { status, answers: [{ name, type, ttl, data }] }；status 0 = NOERROR，3 = NXDOMAIN。
   */
  async function doh(name, type = 'A', { timeout = DEFAULT_TIMEOUT } = {}) {
    const q = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    let data;
    try {
      ({ data } = await request(`https://dns.google/resolve?${q}`, { timeout }));
    } catch (e) {
      ({ data } = await request(`https://cloudflare-dns.com/dns-query?${q}`, {
        timeout, headers: { accept: 'application/dns-json' },
      }));
    }
    return {
      status: data.Status,
      answers: (data.Answer || []).map((a) => ({ name: a.name, type: a.type, ttl: a.TTL, data: a.data })),
    };
  }

  const reverseV4 = (ip) => ip.split('.').reverse().join('.');

  /**
   * 规范化用户输入的主机名：去掉协议、路径、端口与末尾的点，中文域名转为 punycode。
   * 不是合法 IP 或域名时返回空串。
   */
  function normalizeHost(input) {
    let s = clean(input).toLowerCase();
    if (!s) return '';
    if (ipFamily(s)) return s;
    if (ipFamily(s.replace(/^\[|\]$/g, ''))) return s.replace(/^\[|\]$/g, '');
    try {
      s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `http://${s}`).hostname.replace(/\.$/, '');
    } catch (e) {
      return '';
    }
    if (ipFamily(s.replace(/^\[|\]$/g, ''))) return s.replace(/^\[|\]$/g, '');
    return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(s) ? s : '';
  }

  /** 非加密哈希（两路 32 位 FNV-1a 变体），用于指纹摘要；不依赖安全上下文 */
  function hash(str) {
    let h1 = 0x811c9dc5;
    let h2 = 0x5bd1e995;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  const ERROR_TEXT = {
    timeout: '超时',
    network: '无法连接',
    http: 'HTTP 错误',
    parse: '响应异常',
    family: '未返回 IPv6',
    https: 'HTTPS 页面不可用',
    notfound: '查无记录',
    notld: '该后缀没有公开的 RDAP 服务',
    notcf: '无法读取（可能未使用 Cloudflare）',
    invalid: '格式不正确',
    unsupported: '浏览器不支持',
    nocandidate: '未获取到地址',
    error: '出错',
  };
  const errorText = (code) => ERROR_TEXT[code] || '失败';

  SafeIP.util = {
    request, jsonp, scriptVar, ipFamily, isPublicIP, parseTrace, maskIP, clean, place,
    countryName, randomLabel, idle, pool, makeError, errorText, doh, reverseV4, normalizeHost, hash,
  };
})(typeof window !== 'undefined' ? window : globalThis);

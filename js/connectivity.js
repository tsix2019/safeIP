/* SafeIP · connectivity.js — 网站连通性与延迟（no-cors 请求，收到任何响应即算可达） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const sites = [
    { id: 'baidu', name: '百度', host: 'www.baidu.com', group: 'cn' },
    { id: 'taobao', name: '淘宝', host: 'www.taobao.com', group: 'cn' },
    { id: 'bilibili', name: '哔哩哔哩', host: 'www.bilibili.com', group: 'cn' },
    { id: 'weixin', name: '微信', host: 'weixin.qq.com', group: 'cn' },
    { id: 'jd', name: '京东', host: 'www.jd.com', group: 'cn' },
    { id: 'music163', name: '网易云音乐', host: 'music.163.com', group: 'cn' },
    { id: 'google', name: 'Google', host: 'www.google.com', group: 'intl' },
    { id: 'youtube', name: 'YouTube', host: 'www.youtube.com', group: 'intl' },
    { id: 'github', name: 'GitHub', host: 'github.com', group: 'intl' },
    { id: 'chatgpt', name: 'ChatGPT', host: 'chatgpt.com', group: 'intl' },
    // claude.ai 的 /favicon.ico 不是图片，no-cors 响应会被浏览器 ORB 拦截成网络错误，改测 trace
    { id: 'claude', name: 'Claude', host: 'claude.ai', group: 'intl', path: '/cdn-cgi/trace' },
    { id: 'x', name: 'X', host: 'x.com', group: 'intl' },
    { id: 'wikipedia', name: 'Wikipedia', host: 'www.wikipedia.org', group: 'intl' },
    { id: 'telegram', name: 'Telegram', host: 'telegram.org', group: 'intl' },
    // Instagram 的所有响应都带 Cross-Origin-Resource-Policy: same-origin，跨站请求必被拦截，改测 Facebook
    { id: 'facebook', name: 'Facebook', host: 'www.facebook.com', group: 'intl' },
    { id: 'cloudflare', name: 'Cloudflare', host: 'www.cloudflare.com', group: 'intl' },
  ];

  async function timedFetch(url, timeout) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const t0 = performance.now();
    try {
      await fetch(url, {
        mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal,
      });
      return Math.round(performance.now() - t0);
    } catch (e) {
      throw util.makeError(ctrl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  const WARM_SAMPLES = 3;

  /** 中位数（偶数个取较小的中间值） */
  const median = (list) => {
    if (!list.length) return null;
    const s = [...list].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
  };

  /**
   * 连测 1 + 3 次：首连含 DNS/TCP/TLS 握手，后 3 次复用连接，取中位数近似往返延迟。永不抛错。
   * 探测路径需返回图片或纯文本：HTML / JSON 响应会被浏览器的 ORB 拦截，表现为网络错误（误报不可达）。
   * 不加防缓存参数（cache: 'no-store' 已绕过缓存）：部分站点会把带未知参数的请求重定向到 http 首页。
   */
  async function probe(site, { timeout = 8000 } = {}) {
    const url = `https://${site.host}${site.path || '/favicon.ico'}`;
    try {
      const first = await timedFetch(url, timeout);
      const samples = [first];
      for (let i = 0; i < WARM_SAMPLES; i++) {
        try {
          samples.push(await timedFetch(url, timeout));
        } catch (e) {
          break; // 后续失败不影响"可达"结论
        }
      }
      return { id: site.id, ok: true, first, reuse: median(samples.slice(1)), samples };
    } catch (e) {
      return { id: site.id, ok: false, error: e.code || 'network', samples: [] };
    }
  }

  SafeIP.connectivity = { sites, probe, median };
})(typeof window !== 'undefined' ? window : globalThis);

/* SafeIP · splittest.js — 分流测试：读取 Cloudflare 站点的 /cdn-cgi/trace，看每个域名走哪个出口 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  /** 均为 Cloudflare 托管、trace 允许跨站读取的站点（2026-10 实测） */
  const CATEGORIES = [
    {
      id: 'ai', title: 'AI 服务',
      hosts: ['chatgpt.com', 'api.openai.com', 'claude.ai', 'api.anthropic.com', 'www.anthropic.com', 'grok.com', 'x.ai',
        'www.perplexity.ai', 'poe.com', 'character.ai'],
    },
    {
      id: 'dev', title: '开发者',
      hosts: ['www.npmjs.com', 'registry.npmjs.org', 'unpkg.com', 'cdnjs.cloudflare.com', 'gitlab.com', 'hub.docker.com', 'dash.cloudflare.com'],
    },
    {
      id: 'social', title: '社交与内容',
      hosts: ['x.com', 'medium.com', 'stackoverflow.com', 'www.quora.com', 'www.pixiv.net', 'www.v2ex.com', 'linux.do'],
    },
    {
      id: 'other', title: '工具、购物与金融',
      hosts: ['www.notion.so', 'www.canva.com', 'www.coinbase.com', 'www.crunchyroll.com', 'www.udemy.com', 'www.shopify.com', 'www.indeed.com'],
    },
  ];

  async function doTrace(host) {
    try {
      const { data, ms } = await util.request(`https://${host}/cdn-cgi/trace`, { as: 'text', timeout: 10000 });
      const t = util.parseTrace(data);
      const family = util.ipFamily(t.ip);
      if (!family) throw util.makeError('notcf');
      return { host, ok: true, ip: t.ip, family, loc: t.loc || '', colo: t.colo || '', warp: t.warp || '', fields: t, ms };
    } catch (e) {
      const code = e.status === 404 ? 'notcf' : typeof e.code === 'string' ? e.code : 'network';
      return { host, ok: false, error: code };
    }
  }

  const cache = new Map();
  /** 读取某个站点的 trace（同一会话缓存，fresh 为 true 时重新请求） */
  function trace(host, { fresh = false } = {}) {
    if (fresh || !cache.has(host)) cache.set(host, doTrace(host));
    return cache.get(host);
  }

  SafeIP.splittest = { CATEGORIES, trace };
})(typeof window !== 'undefined' ? window : globalThis);

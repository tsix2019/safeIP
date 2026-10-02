/* SafeIP · router.js — 哈希路由（#/页面?参数）、导航渲染与页面挂载 */
(function (root) {
  'use strict';
  const SafeIP = root.SafeIP;
  const { ui, core } = SafeIP;
  const pages = (SafeIP.pages = SafeIP.pages || {});

  const NAV = [
    { id: 'home', title: '首页', icon: 'home' },
    { id: 'lookup', title: 'IP 查询', icon: 'search' },
    { id: 'split', title: '分流测试', icon: 'route' },
    { id: 'ai', title: 'AI 检测', icon: 'sparkle' },
    { id: 'risk', title: 'IP 评分', icon: 'gauge' },
    { id: 'conn', title: '网络连通', icon: 'activity' },
    { id: 'dns', title: 'DNS 泄露', icon: 'server' },
    { id: 'webrtc', title: 'WebRTC', icon: 'radio' },
    { id: 'cloudflare', title: 'Cloudflare', icon: 'cloud' },
    { id: 'ping', title: '全球 Ping', icon: 'globe' },
    { id: 'fingerprint', title: '浏览器指纹', icon: 'fingerprint' },
    { id: 'china', title: 'isChinaUser', icon: 'flag' },
    { id: 'status', title: '服务状态', icon: 'pulse' },
  ];
  const MORE = [
    { id: 'whois', title: 'Whois 查询', icon: 'file' },
    { id: 'asn', title: 'ASN 查询', icon: 'network' },
    { id: 'card', title: 'IP 卡片', icon: 'image' },
  ];
  const ALL = [...NAV, ...MORE];

  let current = null;
  const HOME_TITLE = document.title; // 首页沿用 index.html 里写给搜索引擎的标题

  function parse() {
    const raw = root.location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const id = pages[path] ? path : 'home';
    return { id, params: new URLSearchParams(query) };
  }

  function href(id, params) {
    const q = params ? new URLSearchParams(params).toString() : '';
    return `#/${id === 'home' ? '' : id}${q ? `?${q}` : ''}`;
  }

  function go(id, params) {
    root.location.hash = href(id, params);
  }

  function renderNav() {
    const link = (p) => `<a href="${href(p.id)}" data-nav="${p.id}">${ui.icon(p.icon)}<span>${ui.esc(p.title)}</span></a>`;
    document.getElementById('nav').innerHTML = `<div class="nav-scroll">${NAV.map(link).join('')}</div>
      <details class="more" id="nav-more">
        <summary>${ui.icon('chevron')}<span>更多</span></summary>
        <div class="more-menu">${MORE.map(link).join('')}</div>
      </details>`;
  }

  function highlight(id) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === id));
    const more = document.getElementById('nav-more');
    more.classList.toggle('active', MORE.some((p) => p.id === id));
    more.open = false;
    const active = document.querySelector(`.nav [data-nav="${id}"]`);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function mount() {
    const { id, params } = parse();
    if (current && current.page.unmount) current.page.unmount();
    const view = document.getElementById('view');
    const page = pages[id];
    view.innerHTML = '';
    view.dataset.page = id;
    current = { id, page };
    page.mount(view, params);
    ui.applySizes(view);
    highlight(id);
    const meta = ALL.find((p) => p.id === id);
    document.title = id === 'home' ? HOME_TITLE : `${meta.title} · SafeIP`;
    root.scrollTo(0, 0);
  }

  function init() {
    renderNav();
    root.addEventListener('hashchange', mount);
    core.on(() => {
      if (current && current.page.update) {
        current.page.update();
        ui.applySizes(document.getElementById('view'));
      }
    });
    mount();
  }

  /** 页面内部状态变化时调用，触发当前页面重绘 */
  function refresh() {
    if (current && current.page.update) {
      current.page.update();
      ui.applySizes(document.getElementById('view'));
    }
  }

  SafeIP.router = { NAV, MORE, init, go, href, refresh };
})(window);

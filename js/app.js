/* SafeIP · app.js — 启动：主题、隐藏 IP、复制、重新检测、进度条，然后挂载路由并开始检测 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { core, router, ui, analyze, sources } = S;
  const $ = (id) => document.getElementById(id);

  // ---------------- 主题：跟随系统 → 浅色 → 深色 ----------------
  const THEMES = { auto: ['contrast', '主题：跟随系统'], light: ['sun', '主题：浅色'], dark: ['moon', '主题：深色'] };
  const ORDER = ['auto', 'light', 'dark'];
  const store = {
    get(k) {
      try { return root.localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { root.localStorage.setItem(k, v); } catch (e) { /* 隐私模式等无法存储 */ }
    },
  };
  let theme = THEMES[store.get('safeip-theme')] ? store.get('safeip-theme') : 'auto';
  function applyTheme() {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const [ic, label] = THEMES[theme];
    const btn = $('theme');
    btn.innerHTML = ui.icon(ic);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  $('theme').addEventListener('click', () => {
    theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    store.set('safeip-theme', theme);
    applyTheme();
    ui.toast(THEMES[theme][1]);
  });
  applyTheme();

  // ---------------- 隐藏 IP ----------------
  $('mask').checked = core.state.mask;
  $('mask').addEventListener('change', (e) => core.setMask(e.target.checked));

  // ---------------- 复制 ----------------
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const ok = await ui.copyText(btn.dataset.copy);
    ui.toast(ok ? `已复制 ${btn.dataset.copy}` : '复制失败，请检查浏览器的剪贴板权限');
  });

  $('copy').addEventListener('click', async () => {
    const v = core.view();
    const extra = [];
    const rk = v.route.intlExit && core.riskOf(v.route.intlExit);
    if (rk) {
      const f = rk.result.factors.map((x) => x.label).join('、');
      extra.push(`【IP 评分】国外出口 ${rk.result.score} 分（${rk.result.label}）${f ? `：${f}` : ''}`);
    }
    if (v.fp) extra.push(`【isChinaUser】${v.china.verdict}（${v.china.score} 分）`);
    const text = analyze.report({
      time: new Date(), groups: sources.GROUPS, sources: v.rows, exits: v.exits, route: v.route,
      geoOf: core.geoOf, typeOf: core.typeOf, rtc: v.rtc, rtcVerdict: v.rtcVerdict, dns: v.dns,
      dnsVerdict: v.dnsVerdict, conn: v.conn, fmt: core.fmt, extra,
    });
    const ok = await ui.copyText(text);
    ui.toast(ok ? (core.state.mask ? '已复制检测报告（IP 已打码）' : '已复制检测报告') : '复制失败，请检查浏览器的剪贴板权限');
  });

  // ---------------- 重新检测与进度 ----------------
  $('rerun').addEventListener('click', () => core.start());
  core.on((v) => {
    const st = core.state;
    const bar = $('progress-bar');
    bar.style.width = st.total ? `${(st.done / st.total) * 100}%` : '0';
    bar.parentElement.classList.toggle('done', v.finished);
    $('rerun').classList.toggle('is-busy', !v.finished);
  });

  // 点击"更多"菜单以外的地方时收起菜单
  document.addEventListener('click', (e) => {
    const more = $('nav-more');
    if (more && more.open && !more.contains(e.target)) more.open = false;
  });

  if (!S.geo.httpAllowed()) {
    $('proto-note').textContent = '当前为 HTTPS 页面：仅支持 HTTP 的 ip-api 已停用，代理 / 机房标记会少一个数据源。下载到本地双击打开可获得完整数据。';
  }

  router.init();
  core.start();
})(window);

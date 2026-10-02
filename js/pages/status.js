/* SafeIP · 服务状态：主流服务官方状态页汇总 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, util, svcstatus } = S;
  const { esc, icon } = ui;

  function card(svc, r) {
    const head = `<header class="ai-head"><span class="section-icon">${icon('pulse')}</span><div><h2>${esc(svc.name)}</h2><small>${esc(svc.page.replace(/^https:\/\//, ''))}</small></div>`;
    if (!r) return `<article class="panel">${head}</header>${ui.SKELETON}</article>`;
    if (!r.ok) return `<article class="panel">${head}</header>${ui.callout('unknown', '获取失败', util.errorText(r.error))}</article>`;
    const incidents = r.incidents.length
      ? `<ul class="link-list">${r.incidents.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a><small>${esc(i.status)} · ${ui.fmtTime(i.updated)}</small></li>`).join('')}</ul>`
      : '<p class="muted">当前没有进行中的事件。</p>';
    const maint = r.maintenances.length
      ? `<p class="muted">计划维护：${r.maintenances.map((m) => `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a>（${ui.fmtTime(m.at)}）`).join('；')}</p>` : '';
    const broken = r.broken.length
      ? `<div class="chips">${r.broken.map((c) => `<span class="chip">${esc(c.name)} · ${esc(c.text)}</span>`).join('')}</div>` : '';
    return `<article class="panel status-card st-${r.st}">${head}<span class="status-tag">${ui.statusIcon(r.st)}${esc(r.text)}</span></header>
      ${r.description || r.updated ? `<p class="muted">${esc(r.description)}${r.description && r.updated ? ' · ' : ''}${r.updated ? `更新于 ${ui.fmtTime(r.updated)}` : ''}</p>` : ''}
      ${broken}${incidents}${maint}
      <a class="more-link" href="${esc(svc.page)}" target="_blank" rel="noopener">打开官方状态页 ${icon('external')}</a>
    </article>`;
  }

  S.pages.status = {
    results: new Map(),

    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'pulse', title: '服务状态',
        desc: '主流服务的官方状态页实时汇总。连不上某个服务时，先看看是不是对方出了故障。',
        actions: `<button type="button" class="btn" data-act="refresh">${icon('refresh')}<span>刷新</span></button>`,
      })}<div class="grid wide" data-r="list"></div>`;
      this.el = el;
      el.querySelector('[data-act="refresh"]').addEventListener('click', () => this.run(true));
      this.run(false);
      this.update();
    },

    run(fresh) {
      if (fresh) this.results.clear();
      svcstatus.SERVICES.forEach((svc) => svcstatus.get(svc.id, { fresh }).then((r) => {
        this.results.set(svc.id, r);
        S.router.refresh();
      }));
      S.router.refresh();
    },

    update() {
      this.el.querySelector('[data-r="list"]').innerHTML = svcstatus.SERVICES.map((svc) => card(svc, this.results.get(svc.id))).join('');
    },
  };
})(window);

/* SafeIP · AI 检测：Claude、ChatGPT 等看到的 IP 与地区，判断是否可用 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze, splittest, svcstatus } = S;
  const { esc, icon } = ui;

  const SERVICES = [
    { id: 'claude', name: 'Claude', vendor: 'Anthropic', status: 'claude', hosts: [['claude.ai', '网页版'], ['api.anthropic.com', 'API']], featured: true },
    { id: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', status: 'openai', hosts: [['chatgpt.com', '网页版'], ['api.openai.com', 'API']], featured: true },
    { id: 'grok', name: 'Grok', vendor: 'xAI', hosts: [['grok.com', '网页版'], ['x.ai', '官网']] },
    { id: 'perplexity', name: 'Perplexity', vendor: 'Perplexity AI', hosts: [['www.perplexity.ai', '网页版']] },
    { id: 'poe', name: 'Poe', vendor: 'Quora', hosts: [['poe.com', '网页版']] },
    { id: 'character', name: 'Character.AI', vendor: 'Character Technologies', hosts: [['character.ai', '网页版']] },
  ];

  /** 汇总一个服务的结论：[状态, 标题, 说明] */
  function verdict(results) {
    if (results.some((r) => !r)) return ['muted', '检测中…', ''];
    const ok = results.filter((r) => r.ok);
    if (!ok.length) return ['critical', '无法连接', '所有入口都无法访问：可能没有走代理，或被网络阻断。'];
    const main = ok[0];
    const where = util.countryName(main.loc);
    if (analyze.aiRegionRestricted(main.loc)) return ['critical', '地区不受支持', `服务判定你位于${where}，该地区通常无法使用。`];
    const rk = core.riskOf(main.ip);
    if (rk && (rk.result.level === 'high' || rk.result.level === 'critical')) {
      return ['warning', '地区可用，但 IP 风险较高', `判定为${where}；出口 IP 评分 ${rk.result.score}，可能触发验证或风控。`];
    }
    const partial = ok.length < results.length ? '（部分入口无法访问）' : '';
    return ['good', '地区可用', `服务判定你位于${where}${partial}。`];
  }

  function hostRow(v, [host, label], r) {
    if (!r) return `<div class="ai-row"><div><b>${esc(host)}</b><small>${esc(label)}</small></div><div class="span-3"><span class="skel w60"></span></div></div>`;
    if (!r.ok) return `<div class="ai-row is-err"><div><b>${esc(host)}</b><small>${esc(label)}</small></div><div class="span-3 muted">✕ ${esc(util.errorText(r.error))}</div></div>`;
    const e = v.exitByIP.get(r.ip);
    const bad = analyze.aiRegionRestricted(r.loc);
    return `<div class="ai-row">
      <div><b>${esc(host)}</b><small>${esc(label)}</small></div>
      <div>${e ? ui.exitTag(e) : ''}${ui.ipText(r.ip)}</div>
      <div>${ui.statusIcon(bad ? 'critical' : 'good')} ${ui.ccBadge(r.loc)} ${esc(util.countryName(r.loc))}</div>
      <div class="muted">${esc(r.colo)} 节点 · ${ui.fmtMs(r.ms)}</div>
    </div>`;
  }

  function serviceCard(v, svc, page) {
    const results = svc.hosts.map(([h]) => page.traces.get(h));
    const [st, title, text] = verdict(results);
    const status = svc.status ? page.status.get(svc.status) : null;
    const statusChip = svc.status
      ? status
        ? status.ok ? `<span class="status-tag">${ui.statusIcon(status.st)}官方状态：${esc(status.text)}</span>` : '<span class="status-tag muted">官方状态获取失败</span>'
        : '<span class="status-tag muted">官方状态加载中…</span>'
      : '';
    const main = results.find((r) => r && r.ok);
    const rk = main && core.riskOf(main.ip);
    const type = main && core.geoOf(main.ip) ? core.typeOf(main.ip) : null;
    const foot = main
      ? `<div class="ai-foot">出口 IP 类型：${esc(type ? S.analyze.typeText(type) : '查询中')} · IP 评分：${rk ? `<a href="${S.router.href('risk', { ip: main.ip })}">${rk.result.score} 分 · ${esc(rk.result.label)}</a>` : '评估中'}</div>`
      : '';
    return `<article class="panel ai-card${svc.featured ? ' featured' : ''}">
      <header class="ai-head"><span class="section-icon">${icon('sparkle')}</span>
        <div><h2>${esc(svc.name)}</h2><small>${esc(svc.vendor)}</small></div>${statusChip}</header>
      ${ui.callout(st, title, text)}
      <div class="ai-rows">${svc.hosts.map((h, i) => hostRow(v, h, results[i])).join('')}</div>
      ${foot}
    </article>`;
  }

  S.pages.ai = {
    traces: new Map(),
    status: new Map(),

    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'sparkle', title: 'AI 检测',
        desc: '检测 Claude、ChatGPT 等 AI 服务实际看到的 IP、判定的国家与节点，判断当前网络能否正常使用，并给出出口 IP 的类型与风险评分。',
        actions: `<button type="button" class="btn" data-act="retest">${icon('refresh')}<span>重新检测</span></button>`,
      })}
        <div class="split-2" data-r="featured"></div>
        ${ui.subhead('其他 AI 服务')}
        <div class="grid wide" data-r="others"></div>
        <p class="note">地区判断基于各服务公开的不支持地区（中国大陆、香港、澳门、俄罗斯、白俄罗斯、伊朗、朝鲜、叙利亚、古巴等），实际以服务方为准。</p>`;
      this.el = el;
      el.querySelector('[data-act="retest"]').addEventListener('click', () => this.run(true));
      this.run(false);
      this.update();
    },

    run(fresh) {
      if (fresh) {
        this.traces.clear();
        this.status.clear();
      }
      SERVICES.forEach((svc) => {
        svc.hosts.forEach(([h]) => splittest.trace(h, { fresh }).then((r) => {
          this.traces.set(h, r);
          if (r.ok) {
            core.ensureGeo(r.ip);
            core.ensureRisk(r.ip);
          }
          S.router.refresh();
        }));
        if (svc.status) {
          svcstatus.get(svc.status, { fresh }).then((r) => {
            this.status.set(svc.status, r);
            S.router.refresh();
          });
        }
      });
      S.router.refresh();
    },

    update() {
      const v = core.view();
      this.el.querySelector('[data-r="featured"]').innerHTML = SERVICES.filter((s) => s.featured).map((s) => serviceCard(v, s, this)).join('');
      this.el.querySelector('[data-r="others"]').innerHTML = SERVICES.filter((s) => !s.featured).map((s) => serviceCard(v, s, this)).join('');
    },
  };
})(window);

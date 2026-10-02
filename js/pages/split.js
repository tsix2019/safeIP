/* SafeIP · 分流测试：多源 IP 检测 + Cloudflare 站点出口测试 + 自定义域名 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze, sources, splittest } = S;
  const { esc, icon } = ui;

  const page = {
    custom: [], // 自定义域名测试记录：{ host, result }
    traces: new Map(), // host → 结果
    running: false,

    mount(el) {
      el.innerHTML = `
        ${ui.pageHead({
          icon: 'route', title: '分流测试',
          desc: '同一时刻，国内服务、国外服务和常见网站各自看到的 IP。卡片顶部的颜色与字母对应首页的出口；不同网站走了不同出口，说明分流规则在生效。',
          actions: `<button type="button" class="btn" data-act="retest">${icon('refresh')}<span>重测站点</span></button>`,
        })}
        <div data-r="sources"></div>
        <section class="section">
          ${ui.subhead('常见网站出口测试', '', '读取网站的 Cloudflare 诊断页，看它实际收到的 IP；超时通常说明该域名没有走代理且被阻断')}
          <div data-r="sites"></div>
        </section>
        <section class="section">
          ${ui.subhead('测试自定义域名', '', '仅支持使用 Cloudflare 的网站')}
          <form class="search-bar" data-r="form">
            <input name="q" placeholder="例如 discord.com、openai.com" autocomplete="off" spellcheck="false" aria-label="域名">
            <button class="btn btn-primary" type="submit">${icon('search')}<span>测试</span></button>
          </form>
          <div class="grid" data-r="custom"></div>
        </section>`;
      this.el = el;
      el.querySelector('[data-act="retest"]').addEventListener('click', () => this.runSites(true));
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        this.testCustom(e.target.q.value);
        e.target.q.value = '';
      });
      this.runSites(false);
      this.update();
    },

    async runSites(fresh) {
      if (this.running) return;
      this.running = true;
      if (fresh) this.traces.clear();
      const hosts = splittest.CATEGORIES.flatMap((c) => c.hosts);
      await util.pool(hosts, 6, async (host) => {
        const r = await splittest.trace(host, { fresh });
        if (r.ok) core.ensureGeo(r.ip);
        this.traces.set(host, r);
        S.router.refresh();
      });
      this.running = false;
      S.router.refresh();
    },

    async testCustom(input) {
      const host = util.normalizeHost(input);
      if (!host || util.ipFamily(host)) {
        ui.toast('请输入有效的域名');
        return;
      }
      const item = { host, result: null };
      this.custom = [item, ...this.custom.filter((x) => x.host !== host)].slice(0, 12);
      S.router.refresh();
      item.result = await splittest.trace(host, { fresh: true });
      if (item.result.ok) core.ensureGeo(item.result.ip);
      S.router.refresh();
    },

    update() {
      const v = core.view();
      const q = (k) => this.el.querySelector(`[data-r="${k}"]`);

      q('sources').innerHTML = Object.entries(sources.GROUPS).map(([gid, g]) => {
        const rows = v.rows.filter((x) => x.meta.group === gid);
        const okN = rows.filter((x) => x.result && x.result.ok).length;
        const doneN = rows.filter((x) => x.result).length;
        const body = gid === 'v6' && doneN === rows.length && okN === 0
          ? '<div class="empty">未检测到 IPv6 出口：你的网络可能没有 IPv6，或者 IPv6 已被禁用。</div>'
          : `<div class="grid">${rows.map((x) => sourceCard(v, x)).join('')}</div>`;
        return ui.subhead(g.title, `${okN}/${rows.length} 成功`, g.desc) + body;
      }).join('');

      q('sites').innerHTML = splittest.CATEGORIES.map((c) => {
        const done = c.hosts.filter((h) => this.traces.has(h));
        const okN = done.filter((h) => this.traces.get(h).ok).length;
        return ui.subhead(c.title, done.length ? `${okN}/${c.hosts.length} 可读取` : '测试中')
          + `<div class="grid compact">${c.hosts.map((h) => traceCard(v, h, this.traces.get(h))).join('')}</div>`;
      }).join('');

      q('custom').innerHTML = this.custom.map((x) => traceCard(v, x.host, x.result)).join('');
    },
  };

  function sourceCard(v, { meta, result: r }) {
    if (!r) return `<article class="item">${ui.itemHead(meta.name, meta.host)}${ui.SKELETON}</article>`;
    if (!r.ok) {
      return `<article class="item is-err">${ui.itemHead(meta.name, meta.host)}<div class="item-ip">✕ ${esc(util.errorText(r.error))}</div></article>`;
    }
    const e = v.exitByIP.get(r.ip);
    const g = core.geoOf(r.ip);
    const x = r.extra || {};
    let extra = '';
    if (x.loc) {
      const warp = x.warp && x.warp !== 'off' ? ' · WARP' : '';
      extra = `<div class="item-note">网站判定 <b>${esc(util.countryName(x.loc))}</b>${x.colo ? ` · ${esc(x.colo)} 节点` : ''}${warp}</div>`;
      if (meta.ai && analyze.aiRegionRestricted(x.loc)) extra += `<div class="warn-chip">${ui.statusIcon('warning')}该地区可能不受支持</div>`;
    }
    const loc = (g && g.location) || r.location;
    const isp = [(g && g.isp) || r.isp, g && g.asn ? `AS${g.asn}` : ''].filter(Boolean).join(' · ');
    return `<article class="item${e ? ` has-exit ${ui.exitClass(e)}` : ''}">
      ${ui.itemHead(meta.name, meta.host, e ? ui.exitTag(e) : '')}
      <div class="item-ip">${ui.ipText(r.ip)}${ui.copyBtn(r.ip)}</div>
      <div class="item-loc">${ui.ccBadge((g && g.cc) || r.cc)}<span>${loc ? esc(loc) : g ? '未知地区' : '<span class="skel w60"></span>'}</span></div>
      ${extra}
      <div class="item-foot"><span>${esc(isp || '—')}</span><span class="ms">${icon('clock')}${ui.fmtMs(r.ms)}</span></div>
    </article>`;
  }

  function traceCard(v, host, r) {
    if (!r) return `<article class="item mini">${ui.itemHead(host, '测试中…')}<span class="skel w60"></span></article>`;
    if (!r.ok) {
      return `<article class="item mini is-err">${ui.itemHead(host, util.errorText(r.error))}</article>`;
    }
    const e = v.exitByIP.get(r.ip);
    const g = core.geoOf(r.ip);
    const right = e ? ui.exitTag(e) : '<span class="chip" title="首页的检测源没有看到这个 IP">新出口</span>';
    const restricted = analyze.aiRegionRestricted(r.loc) && /openai|chatgpt|claude|anthropic|grok|x\.ai|perplexity|poe|character/.test(host);
    return `<article class="item mini${e ? ` has-exit ${ui.exitClass(e)}` : ''}">
      ${ui.itemHead(host, `${util.countryName(r.loc)} · ${r.colo} 节点`, right)}
      <div class="item-ip">${ui.ipText(r.ip)}</div>
      <div class="item-foot"><span>${ui.ccBadge(r.loc)} ${esc((g && g.isp) || '')}</span><span class="ms">${icon('clock')}${ui.fmtMs(r.ms)}</span></div>
      ${restricted ? `<div class="warn-chip">${ui.statusIcon('warning')}该地区可能不受支持</div>` : ''}
    </article>`;
  }

  S.pages.split = page;
})(window);

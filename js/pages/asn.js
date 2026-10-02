/* SafeIP · ASN 查询：持有者、网络类型、宣告的 IP 段 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, whois } = S;
  const { esc, icon } = ui;

  const PREFIX_LIMIT = 60;

  const parseASN = (s) => {
    const m = /^(?:as)?\s*(\d{1,10})$/i.exec(String(s || '').trim());
    return m ? m[1] : '';
  };

  function prefixes(list, label) {
    if (!list.length) return '';
    const shown = list.slice(0, PREFIX_LIMIT);
    return `${ui.subhead(label, `${list.length} 个`)}<div class="chips">${shown.map((p) => `<a class="chip chip-link mono" href="${S.router.href('lookup', { q: p.split('/')[0] })}">${esc(p)}</a>`).join('')}${list.length > PREFIX_LIMIT ? `<span class="muted">…其余 ${list.length - PREFIX_LIMIT} 个未显示</span>` : ''}</div>`;
  }

  S.pages.asn = {
    s: null,

    mount(el, params) {
      const q = params.get('q') || '';
      el.innerHTML = `${ui.pageHead({
        icon: 'network', title: 'ASN 查询',
        desc: '查询自治系统（ASN）的持有者、网络类型和对外宣告的 IP 段。数据来自 RIPEstat、PeeringDB 与 RDAP。',
      })}
        <form class="search-bar" data-r="form">
          <input name="q" value="${esc(q)}" placeholder="ASN，例如 AS13335 或 4134" autocomplete="off" spellcheck="false" aria-label="ASN">
          <button class="btn btn-primary" type="submit">${icon('search')}<span>查询</span></button>
        </form>
        <div class="quick" data-r="quick"></div>
        <div data-r="result"></div>`;
      this.el = el;
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const n = parseASN(e.target.q.value);
        if (!n) {
          ui.toast('请输入有效的 ASN');
          return;
        }
        S.router.go('asn', { q: `AS${n}` });
      });
      this.s = null;
      const n = parseASN(q);
      if (n) this.run(n);
      this.update();
    },

    run(n) {
      const s = { asn: n };
      this.s = s;
      whois.asnInfo(n).then((r) => {
        s.result = r;
        if (this.s === s) S.router.refresh();
      });
    },

    update() {
      const v = core.view();
      const asns = [...new Map(v.exits.map((e) => core.geoOf(e.ip)).filter((g) => g && g.asn).map((g) => [g.asn, g])).values()];
      this.el.querySelector('[data-r="quick"]').innerHTML = asns.length
        ? `<span class="muted">我的出口</span>${asns.map((g) => `<a class="chip chip-link" href="${S.router.href('asn', { q: `AS${g.asn}` })}">AS${esc(g.asn)} ${esc(g.asnName || '')}</a>`).join('')}`
        : '<span class="muted">示例</span><a class="chip chip-link" href="#/asn?q=AS13335">AS13335 Cloudflare</a><a class="chip chip-link" href="#/asn?q=AS15169">AS15169 Google</a>';

      const out = this.el.querySelector('[data-r="result"]');
      const s = this.s;
      if (!s) {
        out.innerHTML = '<div class="empty">输入 ASN 开始查询，也可以点上方你的出口所属的 ASN。</div>';
        return;
      }
      if (!s.result) {
        out.innerHTML = `<div class="panel">${ui.SKELETON}</div>`;
        return;
      }
      const r = s.result;
      if (!r.ok) {
        out.innerHTML = ui.callout('serious', '查询失败', `没有找到 AS${s.asn} 的资料，或数据源暂时无法访问。`);
        return;
      }
      const rd = r.rdap;
      const pdb = r.pdb;
      const overview = `<article class="panel"><p class="eyebrow">AS${esc(r.asn)}</p>${ui.kvTable([
        ['持有者', esc(r.holder || (rd && rd.name) || '—')],
        ['组织', esc((rd && rd.org) || '—')],
        ['国家', esc(rd && rd.country ? `${util.countryName(rd.country)}（${rd.country}）` : '—')],
        ['宣告状态', r.announced === null ? '—' : r.announced ? '正在宣告' : '未宣告'],
        ['分配', esc(r.block || '—')],
        ['注册时间', ui.fmtTime(rd && rd.created)],
        ['滥用投诉', esc((rd && rd.abuse) || '—')],
      ])}</article>`;
      const peering = pdb
        ? `<article class="panel"><p class="eyebrow">PeeringDB</p>${ui.kvTable([
          ['名称', esc(pdb.name)],
          ['网络类型', esc(pdb.typeText || '未公开')],
          ['覆盖范围', esc(pdb.scope || '—')],
          ['流量规模', esc(pdb.traffic || '—')],
          ['流量方向', esc(pdb.ratio || '—')],
          ['互联政策', esc(pdb.policy || '—')],
          ['IRR', esc(pdb.irr || '—')],
          ['网站', pdb.website ? `<a href="${esc(pdb.website)}" target="_blank" rel="noopener">${esc(pdb.website)}</a>` : '—'],
        ])}</article>`
        : `<article class="panel"><p class="eyebrow">PeeringDB</p><p class="muted">该 ASN 没有在 PeeringDB 登记。</p></article>`;
      out.innerHTML = `<div class="split-2">${overview}${peering}</div>
        <section class="section">${r.prefixesLoaded ? prefixes(r.v4, 'IPv4 前缀') + prefixes(r.v6, 'IPv6 前缀') || '<p class="muted">没有宣告任何前缀。</p>' : ui.callout('unknown', '前缀列表获取失败', 'RIPEstat 暂时无法访问。')}</section>`;
    },
  };
})(window);

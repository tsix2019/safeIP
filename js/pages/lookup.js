/* SafeIP · IP 查询：任意 IP / 域名的归属地、ASN、类型、评分、多库对比与 RDAP 网段 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze, geo, whois } = S;
  const { esc, icon } = ui;

  const RISK_STATUS = { low: 'good', medium: 'warning', high: 'serious', critical: 'critical' };
  const EXAMPLES = ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', 'github.com'];

  const page = {
    mount(el, params) {
      const q = params.get('q') || '';
      el.innerHTML = `${ui.pageHead({
        icon: 'search', title: 'IP 查询',
        desc: '查询任意 IP 或域名的归属地、运营商、ASN、IP 类型与风险评分，并对比多个归属地数据库的结果。',
      })}
        <form class="search-bar" data-r="form">
          <input name="q" value="${esc(q)}" placeholder="输入 IP 或域名，例如 1.1.1.1、github.com" autocomplete="off" spellcheck="false" aria-label="IP 或域名">
          <button class="btn btn-primary" type="submit">${icon('search')}<span>查询</span></button>
        </form>
        <div class="quick" data-r="quick"></div>
        <div data-r="result"></div>`;
      this.el = el;
      this.s = null;
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = e.target.q.value.trim();
        if (v) S.router.go('lookup', { q: v });
      });
      if (q) this.run(q);
      this.update();
    },

    async run(input) {
      const s = { input, status: 'loading' };
      this.s = s;
      const host = util.normalizeHost(input);
      if (!host) {
        s.status = 'invalid';
        return;
      }
      let ip = host;
      if (!util.ipFamily(host)) {
        s.domain = host;
        const [a, aaaa] = await Promise.all([
          util.doh(host, 'A').catch(() => null),
          util.doh(host, 'AAAA').catch(() => null),
        ]);
        if (this.s !== s) return;
        s.resolved = [...(a ? a.answers : []), ...(aaaa ? aaaa.answers : [])]
          .filter((x) => x.type === 1 || x.type === 28).map((x) => x.data);
        if (!s.resolved.length) {
          s.status = 'noresolve';
          S.router.refresh();
          return;
        }
        ip = s.resolved[0];
      }
      s.ip = ip;
      s.status = 'done';
      S.router.refresh();
      const done = () => this.s === s && S.router.refresh();
      geo.lookup(ip).then((g) => { s.geo = g; done(); });
      geo.compare(ip).then((list) => { s.compare = list; done(); });
      whois.lookup('ip', ip).then((r) => { s.rdap = r; done(); }, (e) => { s.rdapError = e.code || 'network'; done(); });
      core.ensureRisk(ip);
    },

    update() {
      const v = core.view();
      const quick = v.exits.map((e) => `<a class="chip chip-link" href="${S.router.href('lookup', { q: e.ip })}">${ui.exitTag(e)}${esc(core.fmt(e.ip))}</a>`);
      const examples = EXAMPLES.map((x) => `<a class="chip chip-link" href="${S.router.href('lookup', { q: x })}">${esc(x)}</a>`);
      this.el.querySelector('[data-r="quick"]').innerHTML = `${quick.length ? `<span class="muted">我的出口</span>${quick.join('')}` : ''}<span class="muted">示例</span>${examples.join('')}`;
      this.el.querySelector('[data-r="result"]').innerHTML = this.result();
    },

    result() {
      const s = this.s;
      if (!s) return '<div class="empty">输入 IP 或域名开始查询；也可以点上方你的出口 IP。</div>';
      if (s.status === 'invalid') return ui.callout('serious', '无法识别的输入', '请输入 IPv4、IPv6 地址或域名。');
      if (s.status === 'noresolve') return ui.callout('serious', '域名解析失败', `${s.domain} 没有 A / AAAA 记录，或 DoH 查询失败。`);
      if (s.status === 'loading') return `<div class="panel">${ui.SKELETON}</div>`;

      const g = s.geo;
      const rk = core.riskOf(s.ip);
      const skel = '<span class="skel w60"></span>';
      const resolved = s.domain
        ? `<p class="note">${esc(s.domain)} 解析到：${s.resolved.map((ip) => (ip === s.ip ? `<b>${esc(core.fmt(ip))}</b>` : `<a href="${S.router.href('lookup', { q: ip })}">${esc(core.fmt(ip))}</a>`)).join('、')}（经 Google DoH 解析，结果可能因地区不同）</p>`
        : '';
      const type = g ? analyze.classifyIP(g, core.identTypeOf(s.ip)) : null;

      const summary = `<article class="panel">
          <p class="eyebrow">${s.domain ? esc(s.domain) : 'IP 地址'}</p>
          <div class="exit-ip">${ui.ipText(s.ip)}${ui.copyBtn(s.ip)}</div>
          <div class="exit-loc">${ui.ccBadge(g && g.cc)}<span>${g ? esc(g.location || '未知地区') : skel}</span></div>
          ${g ? ui.kvTable([
            ['国家 / 地区', g.cc ? esc(`${util.countryName(g.cc)}（${g.cc}）`) : '—'],
            ['运营商', esc(g.isp || '—')],
            ['ASN', g.asn ? `<a href="${S.router.href('asn', { q: g.asn })}">${esc(analyze.asnText(g))}</a>` : '—'],
            ['IP 类型', type ? `${esc(type.label)}${type.basis ? `<small>${esc(type.basis)}</small>` : ''}` : '—'],
            ['数据来源', esc([g.from.location && `地点 ${g.from.location}`, g.from.asn && `ASN ${g.from.asn}`].filter(Boolean).join(' · ') || '—')],
          ]) : ui.SKELETON}
        </article>`;

      const riskPanel = rk
        ? `<article class="panel">
            <p class="eyebrow">IP 评分</p>
            <div class="score st-${RISK_STATUS[rk.result.level]}"><b>${rk.result.score}</b><span>/100</span><em>${esc(rk.result.label)}</em></div>
            ${ui.meter(rk.result.score, RISK_STATUS[rk.result.level])}
            <ul class="factor-list">${rk.result.factors.length
              ? rk.result.factors.map((f) => `<li><span>${esc(f.label)}</span><b>+${f.points}</b></li>`).join('')
              : `<li class="ok">${ui.statusIcon('good')}<span>未发现风险因素</span></li>`}</ul>
            <a class="more-link" href="${S.router.href('risk', { ip: s.ip })}">查看评分明细 →</a>
          </article>`
        : `<article class="panel"><p class="eyebrow">IP 评分</p>${ui.SKELETON}</article>`;

      const compare = s.compare
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>数据库</th><th>归属地</th><th>运营商</th><th>ASN</th><th>标记</th></tr></thead><tbody>${s.compare.map((x) => {
          if (!x.ok) return `<tr class="muted"><td>${esc(x.name)}</td><td colspan="4">✕ ${esc(util.errorText(x.error))}</td></tr>`;
          const flags = x.flags ? ['proxy', 'hosting', 'mobile'].filter((k) => x.flags[k]).map((k) => ({ proxy: '代理', hosting: '机房', mobile: '移动' }[k])) : [];
          return `<tr><td>${esc(x.name)}</td><td>${ui.ccBadge(x.cc)} ${esc(x.location || '—')}</td><td>${esc(x.isp || '—')}</td><td>${x.asn ? `AS${esc(x.asn)}` : '—'}</td><td>${flags.length ? flags.map((f) => `<span class="chip">${f}</span>`).join(' ') : x.flags ? '无' : '—'}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : `<div class="panel">${ui.SKELETON}</div>`;

      let rdap = `<div class="panel">${ui.SKELETON}</div>`;
      if (s.rdapError) rdap = ui.callout('unknown', 'RDAP 查询失败', util.errorText(s.rdapError));
      else if (s.rdap) {
        const r = s.rdap;
        rdap = `<article class="panel">${ui.kvTable([
          ['网段名称', esc(r.name || '—')], ['地址范围', esc(r.range || '—')], ['CIDR', esc(r.cidr || '—')],
          ['国家', esc(r.country ? `${util.countryName(r.country)}（${r.country}）` : '—')], ['组织', esc(r.org || '—')],
          ['滥用投诉', esc(r.abuse || '—')], ['注册时间', ui.fmtTime(r.created)], ['更新时间', ui.fmtTime(r.updated)],
          ['数据来源', esc(r.source || r.handle || '—')],
        ])}<details class="raw"><summary>查看原始 RDAP 数据</summary><pre>${esc(JSON.stringify(r.raw, null, 2))}</pre></details></article>`;
      }

      return `${resolved}
        <div class="split-2">${summary}${riskPanel}</div>
        <section class="section">${ui.subhead('多数据库对比', '', '不同数据库对同一个 IP 的判断常有差异，以多数为准')}${compare}</section>
        <section class="section">${ui.subhead('RDAP 网段信息', '', '来自区域互联网注册管理机构（RIR）')}${rdap}</section>`;
    },
  };

  S.pages.lookup = page;
})(window);

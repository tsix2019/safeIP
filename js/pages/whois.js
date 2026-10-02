/* SafeIP · Whois 查询：域名与 IP 的 RDAP 注册信息 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, util, whois } = S;
  const { esc, icon } = ui;

  const EXAMPLES = ['github.com', 'openai.com', '1.1.1.1', '8.8.8.8'];

  function domainView(r) {
    return ui.kvTable([
      ['域名', esc(r.unicodeName || r.name)],
      ['注册商', esc([r.registrar, r.registrarId && `IANA ID ${r.registrarId}`].filter(Boolean).join(' · ') || '—')],
      ['注册人', esc(r.registrant || '未公开')],
      ['注册时间', ui.fmtTime(r.created)],
      ['到期时间', ui.fmtTime(r.expires)],
      ['更新时间', ui.fmtTime(r.updated)],
      ['域名状态', r.status.length ? `<div class="chips">${r.status.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : '—'],
      ['DNS 服务器', r.nameservers.length ? r.nameservers.map((n) => `<span class="mono">${esc(n)}</span>`).join('<br>') : '—'],
      ['DNSSEC', r.dnssec === null ? '—' : r.dnssec ? '已签名' : '未签名'],
      ['滥用投诉', esc(r.abuse || '—')],
    ]);
  }

  function ipView(r) {
    return ui.kvTable([
      ['网段名称', esc(r.name || '—')],
      ['地址范围', esc(r.range || '—')],
      ['CIDR', esc(r.cidr || '—')],
      ['类型', esc(r.type || '—')],
      ['国家', esc(r.country ? `${util.countryName(r.country)}（${r.country}）` : '—')],
      ['组织', esc(r.org || '—')],
      ['滥用投诉', esc(r.abuse || '—')],
      ['注册时间', ui.fmtTime(r.created)],
      ['更新时间', ui.fmtTime(r.updated)],
      ['上级网段', esc(r.parent || '—')],
      ['数据来源', esc(r.source || r.handle || '—')],
    ]);
  }

  S.pages.whois = {
    s: null,

    mount(el, params) {
      const q = params.get('q') || '';
      el.innerHTML = `${ui.pageHead({
        icon: 'file', title: 'Whois 查询',
        desc: '通过 RDAP（新一代 WHOIS 协议）查询域名或 IP 的注册信息。子域名会自动换成可注册的主域名再查。',
      })}
        <form class="search-bar" data-r="form">
          <input name="q" value="${esc(q)}" placeholder="域名或 IP，例如 github.com、1.1.1.1" autocomplete="off" spellcheck="false" aria-label="域名或 IP">
          <button class="btn btn-primary" type="submit">${icon('search')}<span>查询</span></button>
        </form>
        <div class="quick">${EXAMPLES.map((x) => `<a class="chip chip-link" href="${S.router.href('whois', { q: x })}">${esc(x)}</a>`).join('')}</div>
        <div data-r="result"></div>`;
      this.el = el;
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = e.target.q.value.trim();
        if (v) S.router.go(/^as\d+$/i.test(v) ? 'asn' : 'whois', { q: v });
      });
      this.s = null;
      if (q) this.run(q);
      this.update();
    },

    run(input) {
      const host = util.normalizeHost(input);
      if (!host) {
        this.s = { error: 'invalid' };
        return;
      }
      const kind = util.ipFamily(host) ? 'ip' : 'domain';
      const q = kind === 'domain' ? whois.registrable(host) : host;
      const s = { kind, q, input: host };
      this.s = s;
      whois.lookup(kind, q).then((r) => {
        s.result = r;
        if (this.s === s) S.router.refresh();
      }, (e) => {
        s.error = typeof e.code === 'string' ? e.code : 'network';
        if (this.s === s) S.router.refresh();
      });
    },

    update() {
      const out = this.el.querySelector('[data-r="result"]');
      const s = this.s;
      if (!s) {
        out.innerHTML = '<div class="empty">输入域名或 IP 开始查询。</div>';
        return;
      }
      if (s.error) {
        const title = s.error === 'invalid' ? '无法识别的输入' : s.error === 'notld' ? '该后缀暂不支持' : '查询失败';
        out.innerHTML = ui.callout('serious', title, s.error === 'invalid' ? '请输入域名或 IP。' : util.errorText(s.error));
        return;
      }
      if (!s.result) {
        out.innerHTML = `<div class="panel">${ui.SKELETON}</div>`;
        return;
      }
      const note = s.kind === 'domain' && s.q !== s.input ? `<p class="note">${esc(s.input)} 是子域名，已改为查询 ${esc(s.q)}。</p>` : '';
      out.innerHTML = `${note}<article class="panel"><p class="eyebrow">${s.kind === 'domain' ? '域名注册信息' : 'IP 网段注册信息'}</p>
        ${s.kind === 'domain' ? domainView(s.result) : ipView(s.result)}
        <details class="raw"><summary>查看原始 RDAP 数据</summary><pre>${esc(JSON.stringify(s.result.raw, null, 2))}</pre></details></article>`;
    },
  };
})(window);

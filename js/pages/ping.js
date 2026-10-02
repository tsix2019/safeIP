/* SafeIP · 全球 Ping：世界各地节点到目标的延迟与丢包 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, gping } = S;
  const { esc, icon } = ui;

  /** ping 往返时间分级：<80ms 快、<200ms 一般、其余慢 */
  const grade = (x) => (x.status !== 'ok' ? 'critical' : x.avg < 80 ? 'good' : x.avg < 200 ? 'warning' : 'serious');
  const GRADE_TEXT = { good: '快', warning: '一般', serious: '慢', critical: '超时' };

  function row(x, max) {
    const where = [util.countryName(x.cc), x.city].filter(Boolean).join(' · ');
    const net = [x.asn, x.network].filter(Boolean).join(' ');
    if (x.status === 'pending') {
      return `<div class="ping-row"><div class="ping-where">${ui.ccBadge(x.cc)}<span><b>${esc(where)}</b><small>${esc(net)}</small></span></div><div class="ping-bar"><span class="skel w40"></span></div><div class="ping-num muted">测量中</div></div>`;
    }
    const st = grade(x);
    if (x.status !== 'ok') {
      return `<div class="ping-row is-err"><div class="ping-where">${ui.ccBadge(x.cc)}<span><b>${esc(where)}</b><small>${esc(net)}</small></span></div><div class="ping-bar"></div><div class="ping-num">${ui.statusIcon('critical')} ${x.status === 'error' ? '无法解析' : '超时'}</div></div>`;
    }
    return `<div class="ping-row"><div class="ping-where">${ui.ccBadge(x.cc)}<span><b>${esc(where)}</b><small>${esc(net)}</small></span></div>
      <div class="ping-bar st-${st}" title="最小 ${x.min} ms · 最大 ${x.max} ms"><i data-w="${Math.max(2, Math.round((x.avg / max) * 100))}"></i></div>
      <div class="ping-num"><b>${x.avg}</b> ms<small>${GRADE_TEXT[st]} · 丢包 ${x.loss == null ? '—' : `${x.loss}%`}</small></div></div>`;
  }

  S.pages.ping = {
    s: null,

    mount(el, params) {
      const target = util.normalizeHost(params.get('target') || '');
      el.innerHTML = `${ui.pageHead({
        icon: 'globe', title: '全球 Ping',
        desc: '从世界各地的节点 Ping 你的出口 IP 或任意地址，看各地到这里的延迟与丢包。数据来自 check-host.net，失败时改用 Globalping。',
      })}
        <form class="search-bar" data-r="form">
          <input name="target" value="${esc(target)}" placeholder="IP 或域名，例如 1.1.1.1" autocomplete="off" spellcheck="false" aria-label="目标地址">
          <button class="btn btn-primary" type="submit">${icon('globe')}<span>开始 Ping</span></button>
        </form>
        <div class="quick" data-r="quick"></div>
        <div data-r="result"></div>
        <p class="note">目标地址会发送给第三方测量平台，由其全球节点发起 ICMP Ping。大量使用时可能被平台限流。</p>`;
      this.el = el;
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const host = util.normalizeHost(e.target.target.value);
        if (!host) {
          ui.toast('请输入有效的 IP 或域名');
          return;
        }
        S.router.go('ping', { target: host });
      });
      if (target) this.start(target);
      this.update();
    },

    async start(target) {
      const s = { target, running: true, list: [], meta: null, error: '' };
      this.s = s;
      try {
        const res = await gping.run(target, (list, meta) => {
          if (this.s !== s) return;
          s.list = list;
          s.meta = meta;
          S.router.refresh();
        });
        s.list = res.list;
        s.meta = res;
      } catch (e) {
        s.error = typeof e.code === 'string' ? e.code : 'network';
      }
      s.running = false;
      if (this.s === s) S.router.refresh();
    },

    update() {
      const v = core.view();
      const quick = v.exits.map((e) => `<a class="chip chip-link" href="${S.router.href('ping', { target: e.ip })}">${ui.exitTag(e)}${esc(core.fmt(e.ip))}</a>`);
      this.el.querySelector('[data-r="quick"]').innerHTML = quick.length ? `<span class="muted">Ping 我的出口</span>${quick.join('')}` : '';
      const out = this.el.querySelector('[data-r="result"]');
      const s = this.s;
      if (!s) {
        out.innerHTML = '<div class="empty">选择上方你的出口，或输入任意地址开始测量。</div>';
        return;
      }
      if (s.error && !s.list.length) {
        out.innerHTML = ui.callout('critical', '测量失败', `check-host.net 与 Globalping 均无法访问（${util.errorText(s.error)}）。`);
        return;
      }
      const ok = s.list.filter((x) => x.status === 'ok');
      const sorted = [...s.list].sort((a, b) => {
        const rank = (x) => (x.status === 'ok' ? 0 : x.status === 'pending' ? 1 : 2);
        return rank(a) - rank(b) || (a.avg || 0) - (b.avg || 0);
      });
      const max = Math.max(...ok.map((x) => x.avg), 1);
      const avg = ok.length ? Math.round(ok.reduce((n, x) => n + x.avg, 0) / ok.length) : null;
      const summary = `<div class="stat-row">
        <div class="stat"><small>目标</small><b class="mono">${esc(core.fmt(s.target))}</b></div>
        <div class="stat"><small>节点</small><b>${ok.length} / ${s.list.length}${s.running ? ' 测量中' : ''}</b></div>
        <div class="stat"><small>平均延迟</small><b>${avg == null ? '—' : `${avg} ms`}</b></div>
        <div class="stat"><small>最快</small><b>${ok.length ? `${esc(util.countryName(sorted[0].cc))} ${sorted[0].avg} ms` : '—'}</b></div>
      </div>`;
      const link = s.meta && s.meta.link
        ? `<a class="more-link" href="${esc(s.meta.link)}" target="_blank" rel="noopener">在 ${esc(s.meta.provider)} 查看完整报告 ${icon('external')}</a>` : '';
      out.innerHTML = `${summary}<div class="panel ping-list">${sorted.map((x) => row(x, max)).join('') || ui.SKELETON}</div>${link}`;
    },
  };
})(window);

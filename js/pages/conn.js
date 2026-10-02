/* SafeIP · 网络连通 / 延迟测试 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze } = S;
  const { esc, icon } = ui;

  const GRADE_STATUS = { fast: 'good', ok: 'warning', slow: 'serious', fail: 'critical' };

  function card({ site, result: r }) {
    if (!r) return `<article class="item site">${ui.itemHead(site.name, site.host)}<span class="skel w60"></span></article>`;
    const grade = analyze.latencyGrade(r);
    const st = GRADE_STATUS[grade];
    const tag = `<span class="status-tag">${ui.statusIcon(st)}${analyze.GRADE_TEXT[grade]}</span>`;
    if (!r.ok) {
      return `<article class="item site is-err">${ui.itemHead(site.name, site.host, tag)}<div class="site-fail">${esc(util.errorText(r.error))}</div></article>`;
    }
    const main = r.reuse != null ? r.reuse : r.first;
    const max = Math.max(...r.samples, 1);
    const bars = r.samples.map((ms, i) => {
      const g = GRADE_STATUS[analyze.latencyGrade({ ok: true, first: ms, reuse: ms })];
      return `<i class="st-${g}" data-h="${Math.max(10, Math.round((ms / max) * 100))}" title="${i === 0 ? '首连' : `第 ${i + 1} 次`}：${ms} ms"></i>`;
    }).join('');
    return `<article class="item site">${ui.itemHead(site.name, site.host, tag)}
      <div class="site-body">
        <div class="site-ms"><b>${main}</b><span>ms</span><small>${r.reuse != null ? `首连 ${r.first} ms` : '仅测得首连'}</small></div>
        <div class="bars" aria-hidden="true">${bars}</div>
      </div></article>`;
  }

  S.pages.conn = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'activity', title: '网络连通',
        desc: '每个网站连测 4 次：第 1 次含 DNS、TCP、TLS 握手（首连），后 3 次复用连接，大字为其中位数。基于 HTTP 请求计时，不等同于 ping。',
        actions: `<button type="button" class="btn" data-act="again">${icon('refresh')}<span>再测一次</span></button>`,
      })}<div data-r="body"></div>`;
      this.el = el;
      el.querySelector('[data-act="again"]').addEventListener('click', () => {
        if (!core.isFinished()) ui.toast('请等待本轮检测完成');
        else core.rerunConn();
      });
      this.update();
    },

    update() {
      const v = core.view();
      this.el.querySelector('[data-act="again"]').classList.toggle('is-busy', v.connBusy || !v.finished);
      this.el.querySelector('[data-r="body"]').innerHTML = [['cn', '国内网站'], ['intl', '国外网站']].map(([gid, title]) => {
        const items = v.conn.filter((x) => x.site.group === gid);
        const doneN = items.filter((x) => x.result).length;
        const okN = items.filter((x) => x.result && x.result.ok).length;
        return ui.subhead(title, doneN ? `${okN}/${items.length} 可达` : '等待 IP 检测完成')
          + `<div class="grid">${items.map(card).join('')}</div>`;
      }).join('');
    },
  };
})(window);

/* SafeIP · isChinaUser：网站会不会把你识别为中国大陆用户 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core } = S;
  const { esc } = ui;

  const LEVEL_STATUS = { high: 'serious', medium: 'warning', low: 'good' };

  function signalRow(s) {
    const st = s.hit === null ? 'muted' : s.hit ? (s.weight >= 20 ? 'serious' : 'warning') : 'good';
    const state = s.hit === null ? '检测中' : s.hit ? '命中' : '未命中';
    return `<li class="signal">${ui.statusIcon(st)}
      <div><b>${esc(s.label)}</b><small>${esc(s.detail)}</small>${s.hit ? `<p>${esc(s.tip)}</p>` : ''}</div>
      <span class="signal-w">${state}${s.hit ? ` · +${s.weight}` : ''}</span></li>`;
  }

  S.pages.china = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'flag', title: 'isChinaUser',
        desc: '汇总网站常用的地区识别信号：出口 IP、WebRTC、时区、语言、DNS、字体以及 Google 的可达性，判断你会不会被识别为中国大陆用户。',
      })}<div data-r="body"></div>`;
      this.el = el;
      this.update();
    },

    update() {
      const v = core.view();
      const c = v.china;
      const st = LEVEL_STATUS[c.level];
      const sigs = [...v.chinaSignals].sort((a, b) => (b.hit === true) - (a.hit === true) || b.weight - a.weight);
      this.el.querySelector('[data-r="body"]').innerHTML = `
        <div class="split-2">
          <article class="panel">
            <p class="eyebrow">判定结果</p>
            <div class="score st-${st}"><b>${c.score}</b><span>/100</span><em>${esc(c.verdict)}</em></div>
            ${ui.meter(c.score, st)}
            <p class="muted">${c.complete ? '所有信号均已检测完毕。' : '部分信号仍在检测，分数可能继续变化。'}得分 ≥60 很可能、30～59 可能、&lt;30 不太可能被识别为中国大陆用户。</p>
          </article>
          <article class="panel">
            <p class="eyebrow">网站是怎么判断的</p>
            <p class="muted">网站通常综合多种信号：最主要的是访问 IP 的归属地，其次是 WebRTC 暴露的真实 IP、浏览器时区与语言；DNS 解析来源、中文字体和对 Google 等站点的可达性也会作为辅助证据。只要其中一项明显指向中国大陆，就可能触发地区限制或额外验证。</p>
          </article>
        </div>
        <section class="section">${ui.subhead('信号明细', `${v.chinaSignals.filter((s) => s.hit).length} 项命中`)}
          <ul class="signal-list panel">${sigs.map(signalRow).join('')}</ul>
        </section>`;
    },
  };
})(window);

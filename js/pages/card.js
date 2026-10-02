/* SafeIP · IP 卡片：生成可分享的检测结果图片 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, analyze, ipcard } = S;
  const { icon } = ui;

  function cardData(v) {
    const p = (n) => String(n).padStart(2, '0');
    const t = new Date();
    const tiles = S.pages.home.tiles(v).map(([, , name, st, status]) => ({ name, st, status }));
    return {
      title: v.done.some((r) => r.ok) ? analyze.verdictText(v.route) : '正在检测…',
      time: `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`,
      masked: core.state.mask,
      exits: v.exits.map((e) => {
        const g = core.geoOf(e.ip);
        return {
          label: e.label, index: e.index, family: e.family, ip: core.fmt(e.ip),
          location: g ? g.location : '', isp: g ? g.isp : '', type: g ? core.typeOf(e.ip).label : '',
        };
      }),
      tiles,
    };
  }

  S.pages.card = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'image', title: 'IP 卡片',
        desc: '把出口与检测结论生成一张 1200×630 的图片，方便分享或求助。分享前建议先打开右上角的"隐藏 IP"。',
        actions: `<button type="button" class="btn btn-primary" data-act="download">${icon('download')}<span>下载 PNG</span></button>`,
      })}
        <div class="card-preview"><canvas data-r="canvas" aria-label="IP 卡片预览"></canvas></div>`;
      this.el = el;
      el.querySelector('[data-act="download"]').addEventListener('click', () => this.download());
      this.last = 0;
      this.update();
    },

    update() {
      // 检测进行中时重绘较频繁，限制为每 300ms 一次
      const now = Date.now();
      clearTimeout(this.timer);
      if (now - this.last < 300) {
        this.timer = setTimeout(() => this.update(), 300);
        return;
      }
      this.last = now;
      const v = core.view();
      if (v.route.intlExit && core.geoOf(v.route.intlExit)) core.ensureRisk(v.route.intlExit);
      ipcard.draw(this.el.querySelector('[data-r="canvas"]'), cardData(v));
    },

    download() {
      const canvas = this.el.querySelector('[data-r="canvas"]');
      ipcard.draw(canvas, cardData(core.view()));
      canvas.toBlob((blob) => {
        if (!blob) {
          ui.toast('生成图片失败');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `safeip-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        ui.toast(core.state.mask ? '已下载（IP 已打码）' : '已下载；分享前请确认是否需要隐藏 IP');
      }, 'image/png');
    },

    unmount() {
      clearTimeout(this.timer);
    },
  };
})(window);

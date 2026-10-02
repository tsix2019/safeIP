/* SafeIP · 浏览器指纹：网站无需 Cookie 即可读取的信息，以及与出口所在地的一致性 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util } = S;
  const { esc } = ui;

  const yes = (b) => (b ? '是' : '否');
  const offsetText = (min) => {
    const sign = min >= 0 ? '+' : '-';
    const a = Math.abs(min);
    return `UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  };

  function panel(title, rows) {
    return `<article class="panel"><p class="eyebrow">${esc(title)}</p>${ui.kvTable(rows.map(([k, val]) => [k, esc(val == null || val === '' ? '—' : val)]))}</article>`;
  }

  S.pages.fingerprint = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'fingerprint', title: '浏览器指纹',
        desc: '网站不需要 Cookie 也能读取下面这些信息来识别你、判断你是否在使用代理。所有数据都在本地计算，不会上传。',
      })}<div data-r="body"></div>`;
      this.el = el;
      this.update();
    },

    update() {
      const v = core.view();
      const f = v.fp;
      const body = this.el.querySelector('[data-r="body"]');
      if (!f) {
        body.innerHTML = `<div class="panel">${ui.SKELETON}</div>`;
        return;
      }
      const intl = v.route.intlExit ? core.geoOf(v.route.intlExit) : null;
      const checks = S.fp.consistency(f, { exitCC: intl && intl.cc });
      const s = f.screen;
      const ch = f.ch;
      const cnFonts = f.fonts.filter((x) => S.fp.CN_FONTS.includes(x));

      body.innerHTML = `
        <article class="panel fp-id">
          <div><p class="eyebrow">指纹 ID</p><b class="mono">${esc(f.id)}</b>
            <small>由 User-Agent、语言、时区、屏幕、硬件、Canvas、WebGL、音频与字体综合计算。同一浏览器多次访问通常保持不变。</small></div>
        </article>
        ${checks.length ? `<div class="stack">${checks.map((c) => ui.callout(c.st, c.title, c.detail)).join('')}</div>`
          : intl ? '' : ui.callout('muted', '等待出口检测完成', '完成后会比对时区、语言与出口 IP 所在地。')}
        <div class="split-2">
          ${panel('浏览器与系统', [
            ['User-Agent', f.ua],
            ['浏览器（UA-CH）', ch ? ch.brands.join('、') : '浏览器不支持 UA-CH'],
            ['平台', f.platform],
            ['系统（UA-CH）', ch ? [ch.platform, ch.platformVersion].filter(Boolean).join(' ') : ''],
            ['架构', ch ? ch.architecture : ''],
            ['设备型号', ch ? ch.model : ''],
            ['移动设备', ch ? yes(ch.mobile) : ''],
            ['自动化浏览器', yes(f.webdriver)],
          ])}
          ${panel('语言与时区', [
            ['首选语言', f.languages[0]],
            ['全部语言', f.languages.join('、')],
            ['时区', f.timeZone],
            ['UTC 偏移', offsetText(f.tzOffset)],
            ['区域格式', f.locale],
            ['日历', { gregory: '公历', chinese: '农历', japanese: '和历', buddhist: '佛历', islamic: '伊斯兰历' }[f.calendar] || f.calendar],
          ])}
          ${panel('屏幕与显示', [
            ['屏幕分辨率', `${s.w} × ${s.h}`],
            ['可用区域', `${s.aw} × ${s.ah}`],
            ['色深', `${s.depth} 位`],
            ['设备像素比', s.dpr],
            ['配色偏好', f.colorScheme === 'dark' ? '深色' : '浅色'],
            ['减少动画', yes(f.reducedMotion)],
          ])}
          ${panel('硬件', [
            ['CPU 线程数', f.cores],
            ['内存', f.memory ? `≥ ${f.memory} GB` : '浏览器未提供'],
            ['触控点数', f.touch],
            ['GPU 厂商', f.gl ? f.gl.vendor : '不支持 WebGL'],
            ['GPU 型号', f.gl ? f.gl.renderer : ''],
            ['WebGL 版本', f.gl ? f.gl.version : ''],
          ])}
          ${panel('指纹哈希', [
            ['Canvas', f.canvas || '被阻止'],
            ['WebGL', f.gl ? f.gl.hash : '不支持'],
            ['音频', f.audio || '被阻止'],
            ['字体组合', util.hash(f.fonts.join(','))],
          ])}
          ${panel('隐私设置', [
            ['Cookie', f.cookies ? '已启用' : '已禁用'],
            ['Do Not Track', f.dnt ? '已开启' : '未开启'],
            ['Global Privacy Control', f.gpc ? '已开启' : '未开启'],
          ])}
        </div>
        <section class="section">${ui.subhead('检测到的字体', `${f.fonts.length} 个`, cnFonts.length ? `含 ${cnFonts.length} 个简体中文字体` : '')}
          <div class="chips">${f.fonts.map((x) => `<span class="chip${cnFonts.includes(x) ? ' chip-strong' : ''}">${esc(x)}</span>`).join('') || '<span class="muted">无法检测</span>'}</div>
        </section>`;
    },
  };
})(window);

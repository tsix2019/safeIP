/* SafeIP · 首页：结论、六张体检卡、出口卡片、功能入口 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze, sources } = S;
  const { esc, icon } = ui;

  const TOOLS = [
    ['lookup', 'search', 'IP 查询', '任意 IP / 域名的归属地、ASN、类型与多库对比'],
    ['split', 'route', '分流测试', '各服务与 30 个常见站点分别走哪个出口'],
    ['ai', 'sparkle', 'AI 检测', 'ChatGPT、Claude 看到的 IP 与地区是否支持'],
    ['risk', 'gauge', 'IP 评分', '机房 / 代理标记、黑名单、原生 IP 等综合评分'],
    ['conn', 'activity', '网络连通', '常用国内外网站的可达性与延迟'],
    ['dns', 'server', 'DNS 泄露', '实际替你解析域名的 DNS 服务器'],
    ['webrtc', 'radio', 'WebRTC', 'STUN 能否拿到你的真实 IP'],
    ['cloudflare', 'cloud', 'Cloudflare', '节点位置、协议版本、WARP 状态'],
    ['ping', 'globe', '全球 Ping', '世界各地节点到你出口的延迟'],
    ['fingerprint', 'fingerprint', '浏览器指纹', '时区、语言、Canvas、WebGL 等指纹'],
    ['china', 'flag', 'isChinaUser', '会不会被识别为中国大陆用户'],
    ['status', 'pulse', '服务状态', 'OpenAI、Claude、GitHub 等官方状态'],
    ['whois', 'file', 'Whois 查询', '域名与 IP 的 RDAP 注册信息'],
    ['asn', 'network', 'ASN 查询', '自治系统持有者、网络类型与 IP 段'],
    ['card', 'image', 'IP 卡片', '生成可分享的检测结果图片'],
  ];

  const RISK_STATUS = { low: 'good', medium: 'warning', high: 'serious', critical: 'critical' };
  const CHINA_STATUS = { low: 'good', medium: 'warning', high: 'serious' };

  function tiles(v) {
    const name = util.countryName;
    const fmt = core.fmt;
    const r = v.route;

    let route = ['muted', '检测中', ''];
    if (r.status === 'split') route = ['good', '已分流', `${r.count} 个 IPv4 出口${r.exceptions.length ? ` · ${r.exceptions.length} 个例外` : ''}`];
    else if (r.status === 'single') route = ['info', '单一出口', '所有服务看到同一个 IP'];
    else if (v.finished) route = ['critical', '检测失败', '所有服务均无法访问'];

    const w = v.rtcVerdict;
    const label = (ip) => (v.exitByIP.get(ip) || {}).label;
    const rtc = {
      leak: () => ['critical', '存在泄露', `暴露 ${w.leaked.map((l) => fmt(l.ip) + (label(l.ip) ? `（出口 ${label(l.ip)}）` : '')).join('、')}`],
      safe: () => ['good', '未泄露', 'UDP 出口与国外出口一致'],
      blocked: () => ['good', '已阻断', '网页拿不到你的公网 IP'],
      unsupported: () => ['good', '不可用', '浏览器不支持 WebRTC'],
      unknown: () => ['muted', '待对比', '等待国外出口结果'],
    }[w.status];

    const d = v.dnsVerdict;
    let dnsT = ['muted', '检测中', ''];
    if (d.status === 'leak') dnsT = ['warning', '有泄露风险', `解析服务器位于${[...new Set(d.resolvers.map((x) => name(x.cc)))].join('、')}`];
    else if (d.status === 'safe') dnsT = ['good', '未发现泄露', `解析服务器位于${name(d.exitCC)}`];
    else if (d.reason === 'noresult') dnsT = ['serious', '无结果', '未能获取解析服务器'];

    const a = v.ai;
    let ai = ['muted', '检测中', ''];
    if (a.status === 'restricted') ai = ['warning', '可能受限', a.restricted.map((x) => `${x.name} 判定为${name(x.cc)}`).join('；')];
    else if (a.status === 'ok') ai = ['good', '地区可用', `被判定为${a.ccs.map(name).join('、')}`];
    else if (a.status === 'failed') ai = ['serious', '无法访问', 'AI 站点均未响应'];

    let riskT = ['muted', '评估中', ''];
    const assessed = r.intlExit && core.riskOf(r.intlExit);
    if (assessed) {
      const x = assessed.result;
      riskT = [RISK_STATUS[x.level], `${x.label} · ${x.score} 分`, x.factors.length ? x.factors.map((f) => f.label).join('、') : '国外出口未发现风险因素'];
    } else if (v.finished && !r.intlExit) {
      riskT = ['unknown', '无出口', '没有可评估的国外出口'];
    }

    const c = v.china;
    const hits = v.chinaSignals.filter((s) => s.hit).map((s) => s.label);
    const chinaT = v.fp && (v.finished || c.complete)
      ? [CHINA_STATUS[c.level], `${{ high: '很可能', medium: '可能', low: '不太可能' }[c.level]} · ${c.score} 分`, hits.length ? hits.slice(0, 2).join('、') : '未发现明显的中国用户特征']
      : ['muted', '检测中', ''];

    return [
      ['split', 'route', '分流状态', ...route],
      ['webrtc', 'radio', 'WebRTC', ...(rtc ? rtc() : ['muted', '检测中', ''])],
      ['dns', 'server', 'DNS', ...dnsT],
      ['ai', 'sparkle', 'AI 服务地区', ...ai],
      ['risk', 'gauge', 'IP 评分', ...riskT],
      ['china', 'flag', 'isChinaUser', ...chinaT],
    ];
  }

  function exitCard(v, e) {
    const g = core.geoOf(e.ip);
    const t = g ? core.typeOf(e.ip) : null;
    const rk = core.riskOf(e.ip);
    const roles = [];
    if (v.route.status === 'split' && e.family === 'v4') {
      if (e.ip === v.route.cnExit && e.ip === v.route.intlExit) roles.push('主出口');
      else {
        if (e.ip === v.route.cnExit) roles.push('国内主出口');
        if (e.ip === v.route.intlExit) roles.push('国外主出口');
      }
    }
    const skel = '<span class="skel w60"></span>';
    const kv = (ic, label, value) => `<div><dt>${icon(ic)}${label}</dt><dd>${value}</dd></div>`;
    const href = (id, p) => S.router.href(id, p);
    return `<article class="exit ${ui.exitClass(e)}">
      <div class="exit-top">${ui.exitPill(e)}<span class="chip">${e.family === 'v6' ? 'IPv6' : 'IPv4'}</span>${roles.map((x) => `<span class="chip chip-strong">${x}</span>`).join('')}<span class="exit-count">${e.sources.length} 个服务</span></div>
      <div class="exit-ip">${ui.ipText(e.ip)}${ui.copyBtn(e.ip)}</div>
      <div class="exit-loc">${ui.ccBadge(g && g.cc)}<span>${g ? esc(g.location || '未知地区') : skel}</span></div>
      <dl class="kv">
        ${kv('building', '运营商', g ? esc(g.isp || '—') : skel)}
        ${kv('hash', 'ASN', g ? (g.asn ? `<a href="${href('asn', { q: g.asn })}">${esc(analyze.asnText(g))}</a>` : '—') : skel)}
        ${kv('shield', '类型', t ? `${esc(t.label)}${t.basis ? `<small>${esc(t.basis)}</small>` : ''}` : skel)}
        ${rk ? kv('gauge', '评分', `<a href="${href('risk')}">${rk.result.score} 分 · ${esc(rk.result.label)}</a>`) : ''}
      </dl>
      <div class="seen"><span class="seen-label">看到这个出口的服务</span>
        <div class="seen-chips">${e.sources.map((s) => `<span class="chip">${esc(s.name)}</span>`).join('')}</div></div>
    </article>`;
  }

  /** 出结果前的两张骨架卡片（多数分流用户有国内、国外两个出口） */
  const EXIT_SKELETON = (() => {
    const skel = '<span class="skel w60"></span>';
    const kv = (ic, label) => `<div><dt>${icon(ic)}${label}</dt><dd>${skel}</dd></div>`;
    const card = `<article class="exit exit-skel" aria-hidden="true">
      <div class="exit-top"><span class="skel"></span></div>
      <div class="exit-ip"><span class="skel"></span></div>
      <div class="exit-loc"><span class="skel"></span></div>
      <dl class="kv">${kv('building', '运营商')}${kv('hash', 'ASN')}${kv('shield', '类型')}</dl>
      <div class="seen"><span class="seen-label">看到这个出口的服务</span><div class="seen-chips"><span class="skel"></span></div></div>
    </article>`;
    return card + card;
  })();

  S.pages.home = {
    tiles, // IP 卡片复用

    mount(el) {
      el.innerHTML = `
        <section class="hero">
          <div class="hero-head">
            <div class="hero-text">
              <p class="eyebrow">网络出口概览</p>
              <h1 class="hero-title" data-r="title" aria-live="polite">正在检测…</h1>
              <p class="hero-sub" data-r="sub"></p>
            </div>
            <div class="run-meta" data-r="meta"></div>
          </div>
          <div class="health" data-r="health"></div>
          <div class="exits" data-r="exits"></div>
          <ul class="alerts" data-r="alerts"></ul>
        </section>
        <section class="section">
          ${ui.subhead('全部功能')}
          <div class="tools">${TOOLS.map(([id, ic, title, desc]) => `
            <a class="tool" href="${S.router.href(id)}"><span class="section-icon">${icon(ic)}</span>
              <span><b>${esc(title)}</b><small>${esc(desc)}</small></span></a>`).join('')}</div>
        </section>`;
      this.el = el;
      this.update();
    },

    update() {
      const q = (k) => this.el.querySelector(`[data-r="${k}"]`);
      const v = core.view();
      const { route } = v;
      if (route.intlExit && core.geoOf(route.intlExit)) core.ensureRisk(route.intlExit);

      let title = '正在检测…';
      // 检测中也给副标题一句说明：避免结果出来时标题区突然变高
      let sub = v.finished ? '' : '正在从国内外几十个服务和网站的视角检测你的出口 IP，结果会陆续出现。';
      if (v.done.some((r) => r.ok)) {
        title = analyze.verdictText(route);
        if (route.status === 'split') {
          const cn = v.exitByIP.get(route.cnExit);
          const intl = v.exitByIP.get(route.intlExit);
          if (route.sameMain && cn) sub = `大部分服务都走出口 ${cn.label}，只有少数服务例外，可能只有个别域名被分流。`;
          else if (cn && intl) sub = `国内服务主要走出口 ${cn.label}，国外服务与网站主要走出口 ${intl.label}。`;
        } else if (route.status === 'single') {
          sub = '可能未开启代理、使用了全局代理，或分流规则把这些服务都指向了同一个出口。';
        }
      } else if (v.finished) {
        title = analyze.verdictText(route);
        sub = '请检查网络连接，或浏览器插件是否拦截了请求。';
      }
      q('title').textContent = title;
      q('sub').textContent = sub;
      const st = core.state;
      q('meta').innerHTML = !st.total ? '' : v.finished
        ? `${ui.statusIcon('good')}完成 · 用时 ${((st.finished - st.started) / 1000).toFixed(1)} 秒`
        : `${ui.statusIcon('muted')}检测中 ${st.done}/${st.total}`;

      q('health').innerHTML = tiles(v).map(([id, ic, name, s, status, detail]) => `
        <a class="health-tile st-${s}" href="${S.router.href(id)}">
          <div class="ht-top"><span class="ht-icon">${icon(ic)}</span>${esc(name)}</div>
          <div class="ht-status">${ui.statusIcon(s)}<span>${esc(status)}</span></div>
          <div class="ht-detail">${esc(detail)}</div>
        </a>`).join('');

      q('exits').innerHTML = v.exits.length ? v.exits.map((e) => exitCard(v, e)).join('') : (v.finished ? '' : EXIT_SKELETON);

      const alerts = [];
      if (route.exceptions.length) {
        const items = route.exceptions.map((x) => `${x.name}（${sources.GROUPS[x.group].title}）走了出口 ${v.exitByIP.get(x.ip).label}`);
        alerts.push(['warning', '分流例外', `${items.join('；')}。与同组多数服务不同，可能是分流规则没有覆盖这些域名。`]);
      }
      q('alerts').innerHTML = alerts
        .map(([s, name, text]) => `<li class="alert st-${s}">${ui.statusIcon(s)}<b>${esc(name)}</b><span>${esc(text)}</span></li>`)
        .join('');
    },
  };
})(window);

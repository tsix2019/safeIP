/* SafeIP · WebRTC 泄露检测 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze, webrtc } = S;
  const { esc, icon } = ui;

  const STATUS = { leak: 'critical', safe: 'good', blocked: 'good', unsupported: 'good' };
  const TITLE = {
    leak: '存在 WebRTC 泄露', safe: '未发现 WebRTC 泄露', blocked: 'WebRTC 未暴露公网 IP',
    unsupported: '浏览器不支持 WebRTC', unknown: '等待对比', pending: '检测中…',
  };

  function card(v, { server, result: r }) {
    const host = server.url.replace(/^stun:/, '');
    if (!r) return `<article class="item">${ui.itemHead(server.name, host)}${ui.SKELETON}</article>`;
    if (!r.ok) {
      return `<article class="item is-err">${ui.itemHead(server.name, host)}<div class="item-ip">✕ ${esc(util.errorText(r.error))}</div></article>`;
    }
    const ip = r.publicIPs[0];
    const e = v.exitByIP.get(ip);
    const g = core.geoOf(ip);
    return `<article class="item${e ? ` has-exit ${ui.exitClass(e)}` : ''}">
      ${ui.itemHead(server.name, host, e ? ui.exitTag(e) : '')}
      ${r.publicIPs.map((x) => `<div class="item-ip">${ui.ipText(x)}${ui.copyBtn(x)}</div>`).join('')}
      <div class="item-loc">${ui.ccBadge(g && g.cc)}<span>${g ? esc(g.location || '未知地区') : '<span class="skel w60"></span>'}</span></div>
      <div class="item-foot"><span>UDP · ${esc((g && g.isp) || '—')}</span><span class="ms">${icon('clock')}${ui.fmtMs(r.ms)}</span></div>
    </article>`;
  }

  S.pages.webrtc = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'radio', title: 'WebRTC 泄露检测',
        desc: '网页可以通过 WebRTC 向 STUN 服务器发送 UDP 请求，拿到你的公网 IP。代理通常不接管 UDP，这里能看出真实 IP 会不会因此暴露。',
      })}<div data-r="body"></div>`;
      this.el = el;
      this.update();
    },

    update() {
      const v = core.view();
      const vd = v.rtcVerdict;
      const st = STATUS[vd.status] || 'muted';
      const labelOf = (ip) => (v.exitByIP.get(ip) || {}).label || '';
      let extra = '';
      if (vd.status === 'leak') {
        const seen = (group) => new Set(v.rtc
          .filter((x) => x.server.group === group && x.result && x.result.ok)
          .flatMap((x) => x.result.publicIPs));
        const cn = seen('cn');
        const intl = [...seen('intl')];
        const udpDirect = intl.length > 0 && intl.every((ip) => cn.has(ip));
        extra = `<p>${udpDirect ? '国外 STUN 服务器看到的也是这个 IP，说明 UDP 流量没有经过代理。' : ''}`
          + '解决办法：在代理客户端开启 TUN（虚拟网卡）模式让 UDP 也走代理，或在浏览器中限制 WebRTC 暴露 IP。</p>';
      }
      let html = ui.callout(st, TITLE[vd.status], analyze.webrtcText(vd, core.fmt, labelOf), extra);

      if (webrtc.supported()) {
        [['cn', '国内 STUN 服务器'], ['intl', '国外 STUN 服务器']].forEach(([gid, title]) => {
          const items = v.rtc.filter((x) => x.server.group === gid);
          const okN = items.filter((x) => x.result && x.result.ok).length;
          html += ui.subhead(title, `${okN}/${items.length} 获取到`) + `<div class="grid">${items.map((x) => card(v, x)).join('')}</div>`;
        });
        const hosts = [...new Set(v.rtc.flatMap((x) => (x.result && x.result.hostCandidates) || []))];
        const exposed = hosts.filter((h) => !/\.local$/i.test(h));
        if (exposed.length) {
          html += `<p class="note">网页可以读取到本机内网地址：${esc(exposed.map(core.fmt).join('、'))}。较新的浏览器会用 mDNS 隐藏它们。</p>`;
        } else if (hosts.length) {
          html += '<p class="note">本机内网地址已被浏览器用 mDNS 随机名隐藏（正常）。</p>';
        }
      }
      this.el.querySelector('[data-r="body"]').innerHTML = html;
    },
  };
})(window);

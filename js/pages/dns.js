/* SafeIP · DNS 泄露检测 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, analyze } = S;
  const { esc } = ui;

  function card(r) {
    const g = core.geoOf(r.ip);
    const loc = g ? g.location || r.hint : r.hint;
    return `<article class="item">
      ${ui.itemHead((g && g.isp) || 'DNS 服务器', `发现于 ${r.via.join(' / ')}`, '', ui.iconAvatar('server'))}
      <div class="item-ip">${ui.ipText(r.ip)}${ui.copyBtn(r.ip)}</div>
      <div class="item-loc">${ui.ccBadge(g && g.cc)}<span>${loc ? esc(loc) : g ? '未知地区' : '<span class="skel w60"></span>'}</span></div>
      <div class="item-foot"><span>${esc((g && analyze.asnText(g)) || '—')}</span></div>
    </article>`;
  }

  S.pages.dns = {
    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'server', title: 'DNS 泄露检测',
        desc: '访问随机生成的域名，看实际是哪些 DNS 服务器替你完成了解析。访问国外网站时，如果解析服务器在国内，运营商就能看到你访问了哪些网站。',
      })}<div data-r="body"></div>`;
      this.el = el;
      this.update();
    },

    update() {
      const v = core.view();
      const vd = v.dnsVerdict;
      const noResult = vd.status === 'unknown' && vd.reason === 'noresult';
      const st = { leak: 'warning', safe: 'good' }[vd.status] || (noResult ? 'serious' : 'muted');
      const title = { leak: 'DNS 存在泄露风险', safe: '未发现 DNS 泄露' }[vd.status] || (noResult ? '没有拿到结果' : '检测中…');
      const tip = vd.status === 'leak'
        ? '<p>解决办法：在代理客户端开启 fake-ip 或远程 DNS，让国外域名在代理端解析。</p>' : '';
      let html = ui.callout(st, title, analyze.dnsText(vd), tip);
      const d = v.dns;
      if (!d) {
        html += `<div class="grid">${[0, 1, 2].map(() => `<article class="item">${ui.SKELETON}</article>`).join('')}</div>`;
      } else if (d.resolvers.length) {
        html += ui.subhead('解析服务器', `${d.resolvers.length} 个`) + `<div class="grid">${d.resolvers.map(card).join('')}</div>`;
      }
      if (d && d.ecs) {
        html += `<p class="note">EDNS 客户端子网（ECS）：${esc(core.fmt(d.ecs.ip))}${d.ecs.hint ? ` · ${esc(d.ecs.hint)}` : ''}。权威 DNS 能据此看到你所在的网段。</p>`;
      }
      if (d && !d.resolvers.length && d.errors.length) {
        html += `<p class="note">两个检测源都没有返回结果（${esc(d.errors.map((x) => `${x.via}：${util.errorText(x.error)}`).join('，'))}）。</p>`;
      }
      this.el.querySelector('[data-r="body"]').innerHTML = html;
    },
  };
})(window);

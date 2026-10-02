/* SafeIP · Cloudflare：trace 全字段解读、多站点节点对比、Cloudflare 服务状态 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util, splittest, svcstatus } = S;
  const { esc, icon } = ui;

  /** Cloudflare 节点（IATA 机场代码）→ 城市 */
  const COLO = {
    HKG: '中国香港', MFM: '中国澳门', TPE: '中国台北', KHH: '中国高雄', SHA: '上海', PVG: '上海', PEK: '北京', PKX: '北京',
    CAN: '广州', SZX: '深圳', CTU: '成都', HGH: '杭州', NKG: '南京', WUH: '武汉', CKG: '重庆', TSN: '天津', XIY: '西安',
    CSX: '长沙', SHE: '沈阳', TAO: '青岛', XMN: '厦门', FOC: '福州', KMG: '昆明', ZGN: '中山', NRT: '东京', HND: '东京',
    KIX: '大阪', FUK: '福冈', OKA: '冲绳', ICN: '首尔', SIN: '新加坡', KUL: '吉隆坡', BKK: '曼谷', HAN: '河内',
    SGN: '胡志明市', MNL: '马尼拉', CGK: '雅加达', DEL: '新德里', BOM: '孟买', MAA: '金奈', BLR: '班加罗尔',
    HYD: '海得拉巴', CCU: '加尔各答', KHI: '卡拉奇', DAC: '达卡', CMB: '科伦坡', KTM: '加德满都', ULN: '乌兰巴托',
    SYD: '悉尼', MEL: '墨尔本', BNE: '布里斯班', PER: '珀斯', ADL: '阿德莱德', CBR: '堪培拉', AKL: '奥克兰',
    CHC: '克赖斯特彻奇', LAX: '洛杉矶', SJC: '圣何塞', SFO: '旧金山', SEA: '西雅图', PDX: '波特兰', LAS: '拉斯维加斯',
    PHX: '凤凰城', DEN: '丹佛', DFW: '达拉斯', IAH: '休斯顿', ORD: '芝加哥', MSP: '明尼阿波利斯', ATL: '亚特兰大',
    MIA: '迈阿密', IAD: '华盛顿', EWR: '纽瓦克', JFK: '纽约', BOS: '波士顿', PHL: '费城', YYZ: '多伦多',
    YVR: '温哥华', YUL: '蒙特利尔', MEX: '墨西哥城', HNL: '檀香山', LHR: '伦敦', MAN: '曼彻斯特', DUB: '都柏林',
    AMS: '阿姆斯特丹', FRA: '法兰克福', MUC: '慕尼黑', DUS: '杜塞尔多夫', HAM: '汉堡', BER: '柏林', TXL: '柏林',
    CDG: '巴黎', MRS: '马赛', BRU: '布鲁塞尔', ZRH: '苏黎世', GVA: '日内瓦', VIE: '维也纳', MXP: '米兰', FCO: '罗马',
    MAD: '马德里', BCN: '巴塞罗那', LIS: '里斯本', CPH: '哥本哈根', ARN: '斯德哥尔摩', OSL: '奥斯陆', HEL: '赫尔辛基',
    WAW: '华沙', PRG: '布拉格', BUD: '布达佩斯', OTP: '布加勒斯特', SOF: '索非亚', ATH: '雅典', IST: '伊斯坦布尔',
    KBP: '基辅', DME: '莫斯科', LED: '圣彼得堡', DXB: '迪拜', DOH: '多哈', TLV: '特拉维夫', RUH: '利雅得', JED: '吉达',
    BAH: '巴林', KWI: '科威特', MCT: '马斯喀特', AMM: '安曼', CAI: '开罗', JNB: '约翰内斯堡', CPT: '开普敦',
    LOS: '拉各斯', NBO: '内罗毕', GRU: '圣保罗', GIG: '里约热内卢', EZE: '布宜诺斯艾利斯', SCL: '圣地亚哥',
    BOG: '波哥大', LIM: '利马',
  };

  const FIELDS = [
    ['ip', '你的 IP'], ['loc', '判定的国家 / 地区'], ['colo', '边缘节点'], ['http', 'HTTP 版本'], ['tls', 'TLS 版本'],
    ['kex', '密钥交换算法'], ['sni', 'SNI 加密（ECH）'], ['warp', 'Cloudflare WARP'], ['gateway', 'Zero Trust Gateway'],
    ['rbi', '远程浏览器隔离'], ['visit_scheme', '访问协议'], ['h', '请求的主机名'], ['fl', '服务器标识'], ['sliver', '灰度分组'],
    ['ts', '服务器时间'], ['uag', 'User-Agent'],
  ];
  const COMPARE = ['www.cloudflare.com', 'dash.cloudflare.com', 'cdnjs.cloudflare.com', 'chatgpt.com', 'claude.ai', 'www.npmjs.com'];

  const coloText = (c) => (c ? `${c}（${COLO[c] || '未收录的城市'}）` : '—');

  function fieldValue(k, val) {
    if (val == null || val === '') return '—';
    switch (k) {
      case 'ip': return core.fmt(val);
      case 'loc': return `${util.countryName(val)}（${val}）`;
      case 'colo': return coloText(val);
      case 'sni': return val === 'encrypted' ? '已加密（ECH）' : val === 'plaintext' ? '未加密' : val;
      case 'warp': return { off: '未使用', on: '已使用 WARP', plus: '已使用 WARP+' }[val] || val;
      case 'gateway': case 'rbi': return val === 'on' ? '已开启' : val === 'off' ? '未开启' : val;
      case 'kex': return /mlkem|kyber/i.test(val) ? `${val}（后量子密钥交换）` : val;
      case 'ts': return new Date(Number(val) * 1000).toLocaleString('zh-CN', { hour12: false });
      default: return val;
    }
  }

  S.pages.cloudflare = {
    traces: new Map(),
    status: null,

    mount(el) {
      el.innerHTML = `${ui.pageHead({
        icon: 'cloud', title: 'Cloudflare',
        desc: 'Cloudflare 边缘节点看到的连接详情：你连到了哪个城市的节点、使用的 HTTP / TLS 版本、是否经过 WARP 与 Zero Trust。',
        actions: `<button type="button" class="btn" data-act="retest">${icon('refresh')}<span>重新检测</span></button>`,
      })}
        <div class="split-2"><div data-r="main"></div><div data-r="status"></div></div>
        <section class="section">${ui.subhead('不同站点连到的节点', '', '同一个出口通常连到同一个节点；不同则说明这些域名走了不同的线路')}<div data-r="compare"></div></section>`;
      this.el = el;
      el.querySelector('[data-act="retest"]').addEventListener('click', () => this.run(true));
      this.run(false);
      this.update();
    },

    run(fresh) {
      if (fresh) {
        this.traces.clear();
        this.status = null;
      }
      COMPARE.forEach((h) => splittest.trace(h, { fresh }).then((r) => {
        this.traces.set(h, r);
        if (r.ok) core.ensureGeo(r.ip);
        S.router.refresh();
      }));
      svcstatus.get('cloudflare', { fresh }).then((r) => {
        this.status = r;
        S.router.refresh();
      });
      S.router.refresh();
    },

    update() {
      const v = core.view();
      const q = (k) => this.el.querySelector(`[data-r="${k}"]`);
      const main = this.traces.get('www.cloudflare.com');
      if (!main) q('main').innerHTML = `<article class="panel">${ui.SKELETON}</article>`;
      else if (!main.ok) q('main').innerHTML = ui.callout('critical', '无法访问 Cloudflare', util.errorText(main.error));
      else {
        q('main').innerHTML = `<article class="panel"><p class="eyebrow">www.cloudflare.com/cdn-cgi/trace</p>${ui.kvTable(
          FIELDS.filter(([k]) => main.fields[k] != null).map(([k, label]) => [label, esc(fieldValue(k, main.fields[k]))])
        )}</article>`;
      }

      const s = this.status;
      let status = `<article class="panel"><p class="eyebrow">Cloudflare 服务状态</p>${ui.SKELETON}</article>`;
      if (s && !s.ok) status = ui.callout('unknown', 'Cloudflare 服务状态获取失败', util.errorText(s.error));
      else if (s) {
        status = `<article class="panel"><p class="eyebrow">Cloudflare 服务状态</p>
          ${ui.callout(s.st, s.text, s.description)}
          ${s.incidents.length ? `<ul class="link-list">${s.incidents.map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a><small>${esc(i.status)} · ${ui.fmtTime(i.updated)}</small></li>`).join('')}</ul>` : '<p class="muted">当前没有进行中的事件。</p>'}
          ${s.broken.length ? `<p class="muted">受影响的节点 / 组件：${esc(s.broken.map((c) => c.name).join('、'))}</p>` : ''}
          <a class="more-link" href="https://www.cloudflarestatus.com" target="_blank" rel="noopener">打开官方状态页 ${icon('external')}</a></article>`;
      }
      q('status').innerHTML = status;

      q('compare').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>站点</th><th>出口 IP</th><th>节点</th><th>判定</th><th>HTTP / TLS</th><th class="num">耗时</th></tr></thead><tbody>${COMPARE.map((h) => {
        const r = this.traces.get(h);
        if (!r) return `<tr><td>${esc(h)}</td><td colspan="5"><span class="skel w40"></span></td></tr>`;
        if (!r.ok) return `<tr class="muted"><td>${esc(h)}</td><td colspan="5">✕ ${esc(util.errorText(r.error))}</td></tr>`;
        const e = v.exitByIP.get(r.ip);
        return `<tr><td>${esc(h)}</td><td>${e ? ui.exitTag(e) : ''}${ui.ipText(r.ip)}</td><td>${esc(coloText(r.colo))}</td><td>${ui.ccBadge(r.loc)} ${esc(util.countryName(r.loc))}</td><td>${esc(`${r.fields.http || '—'} · ${r.fields.tls || '—'}`)}</td><td class="num">${ui.fmtMs(r.ms)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    },
  };

  S.pages.cloudflare.COLO = COLO;
})(window);

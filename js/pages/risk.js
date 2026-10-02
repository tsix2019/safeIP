/* SafeIP · IP 评分：各出口（或指定 IP）的风险分与逐项依据 */
(function (root) {
  'use strict';
  const S = root.SafeIP;
  const { ui, core, util } = S;
  const { esc, icon } = ui;

  const RISK_STATUS = { low: 'good', medium: 'warning', high: 'serious', critical: 'critical' };

  function fact(label, value, st) {
    return `<div class="fact">${st ? ui.statusIcon(st) : ''}<div><small>${esc(label)}</small><b>${value}</b></div></div>`;
  }

  function card(target, a) {
    const head = `${target.exit ? ui.exitPill(target.exit) : '<span class="chip chip-strong">指定 IP</span>'}`;
    if (!a) {
      return `<article class="panel risk-card"><div class="risk-head"><div>${head}<div class="exit-ip">${ui.ipText(target.ip)}</div></div></div>${ui.SKELETON}</article>`;
    }
    const { result: r, signals: s, geo: g } = a;
    const st = RISK_STATUS[r.level];
    const f = s.flags;
    const torText = !s.tor ? '查询失败' : s.tor.exit ? '是（出口节点）' : s.tor.relay ? '是（中继节点）' : '否';
    const sfsText = !s.sfs ? '查询失败' : s.sfs.appears ? `${s.sfs.frequency} 次记录` : '无记录';
    const native = r.native === null ? '无数据' : r.native ? `是（注册与定位均在 ${s.rirCC}）` : `否（注册于 ${s.rirCC}，定位在 ${s.geoCC}）`;
    const facts = [
      fact('原生 IP', esc(native), r.native === null ? 'unknown' : r.native ? 'good' : 'warning'),
      fact('网络类型', esc(s.pdb ? `${s.pdb.typeText || '未公开'}（${s.pdb.name}）` : '未收录于 PeeringDB'), s.pdb ? (['Content', 'Network Services'].includes(s.pdb.type) ? 'warning' : 'good') : 'unknown'),
      fact('IP 类型', esc(S.analyze.typeText(S.analyze.classifyIP(g, s.identType))), s.kind === 'hosting' ? 'warning' : 'good'),
      fact('代理标记', esc(f ? (f.proxy ? '是' : '否') : '无数据（HTTPS 页面无法使用 ip-api）'), f ? (f.proxy ? 'critical' : 'good') : 'unknown'),
      fact('Tor 节点', esc(torText), !s.tor ? 'unknown' : s.tor.exit ? 'critical' : s.tor.relay ? 'warning' : 'good'),
      fact('StopForumSpam', esc(sfsText), !s.sfs ? 'unknown' : s.sfs.appears ? 'serious' : 'good'),
    ].join('');
    const lists = s.dnsbl
      ? s.dnsbl.map((x) => {
        const lst = x.listed === null ? 'unknown' : x.listed ? 'critical' : 'good';
        const text = x.listed === null ? '查询失败' : x.listed ? '已收录' : '未收录';
        return `<div class="fact">${ui.statusIcon(lst)}<div><small>${esc(x.desc)}</small><b>${esc(x.name)} · ${text}</b></div></div>`;
      }).join('')
      : '<p class="note">IPv6 地址暂不支持 DNS 黑名单查询。</p>';

    return `<article class="panel risk-card">
      <div class="risk-head">
        <div>${head}
          <div class="exit-ip">${ui.ipText(target.ip)}${ui.copyBtn(target.ip)}</div>
          <div class="exit-loc">${ui.ccBadge(g.cc)}<span>${esc([g.location, g.isp].filter(Boolean).join(' · ') || '未知地区')}</span></div>
        </div>
        <div class="score st-${st}"><b>${r.score}</b><span>/100</span><em>${esc(r.label)}</em></div>
      </div>
      ${ui.meter(r.score, st)}
      <h4>加分项（越多越可疑）</h4>
      <ul class="factor-list">${r.factors.length
        ? r.factors.map((x) => `<li><span>${esc(x.label)}<small>${esc(x.detail)}</small></span><b>+${x.points}</b></li>`).join('')
        : `<li class="ok">${ui.statusIcon('good')}<span>未发现风险因素</span></li>`}</ul>
      <h4>检测明细</h4>
      <div class="facts">${facts}</div>
      <h4>DNS 黑名单</h4>
      <div class="facts">${lists}</div>
    </article>`;
  }

  S.pages.risk = {
    mount(el, params) {
      const ip = util.normalizeHost(params.get('ip') || '');
      this.custom = util.ipFamily(ip) ? ip : '';
      el.innerHTML = `${ui.pageHead({
        icon: 'gauge', title: 'IP 评分',
        desc: '汇总代理 / 机房标记、网络类型、原生与广播 IP、Tor、滥用记录和 7 个 DNS 黑名单，按公开规则打出 0–100 分（越高越可疑）。仅供参考，不等同于商业风控评分。',
      })}
        <form class="search-bar" data-r="form">
          <input name="ip" value="${esc(this.custom)}" placeholder="评估指定 IP；留空则评估你的出口" autocomplete="off" spellcheck="false" aria-label="IP 地址">
          <button class="btn btn-primary" type="submit">${icon('gauge')}<span>评估</span></button>
        </form>
        <div class="stack" data-r="list"></div>
        <p class="note">评分规则：代理标记 +40，Tor 出口 +50（中继 +10），机房 IP +25，广播 IP +10，每个黑名单 +15（最多 45），StopForumSpam 有记录 +15～30；总分封顶 100。&lt;20 低风险，&lt;50 中风险，&lt;75 高风险，其余为极高风险。</p>`;
      this.el = el;
      el.querySelector('[data-r="form"]').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = e.target.ip.value.trim();
        if (v && !util.ipFamily(util.normalizeHost(v))) {
          ui.toast('请输入有效的 IP 地址');
          return;
        }
        S.router.go('risk', v ? { ip: v } : undefined);
      });
      this.update();
    },

    update() {
      const v = core.view();
      const targets = this.custom
        ? [{ ip: this.custom }]
        : v.exits.map((e) => ({ ip: e.ip, exit: e }));
      targets.forEach((t) => {
        if (this.custom || core.geoOf(t.ip)) core.ensureRisk(t.ip);
      });
      const list = this.el.querySelector('[data-r="list"]');
      if (!targets.length) {
        list.innerHTML = v.finished
          ? ui.callout('serious', '没有可评估的出口', '所有 IP 检测都失败了。')
          : `<div class="panel">${ui.SKELETON}</div>`;
        return;
      }
      list.innerHTML = targets.map((t) => card(t, core.riskOf(t.ip))).join('');
    },
  };
})(window);

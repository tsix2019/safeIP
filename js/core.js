/* SafeIP · core.js — 核心检测：状态、调度与订阅（不负责渲染） */
(function (root) {
  'use strict';
  const SafeIP = root.SafeIP;
  const { util, sources, geo, webrtc, dns, connectivity, analyze, risk, china, fp } = SafeIP;

  const state = {
    run: 0, started: 0, finished: 0, done: 0, total: 0,
    results: new Map(), // 检测源 id → 结果
    order: new Map(), // IP → 首次出现序号（出口字母与颜色）
    geo: new Map(), // IP → GeoInfo
    rtc: new Map(),
    dns: null,
    conn: new Map(),
    connRun: 0,
    connBusy: false,
    risk: new Map(), // IP → 风险评估
    fp: null, // 浏览器指纹（本地采集一次）
    mask: new URLSearchParams(root.location.search).has('mask'),
    view: null,
  };

  // ---------------- 订阅 ----------------

  const listeners = new Set();
  let timer = 0;
  function notify() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      state.view = snapshot();
      listeners.forEach((fn) => {
        try {
          fn(state.view);
        } catch (e) {
          console.error(e);
        }
      });
    }, 40);
  }
  const on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  // ---------------- 查询辅助 ----------------

  const fmt = (ip) => (state.mask ? util.maskIP(ip) : ip);
  const geoOf = (ip) => state.geo.get(ip);
  const riskOf = (ip) => state.risk.get(ip);

  const geoRequested = new Set();
  function ensureGeo(ip) {
    if (!ip || geoRequested.has(ip)) return;
    geoRequested.add(ip);
    geo.lookup(ip).then((g) => {
      state.geo.set(ip, g);
      notify();
    });
  }

  function identTypeOf(ip) {
    for (const id of ['identme', 'identme6']) {
      const r = state.results.get(id);
      if (r && r.ok && r.ip === ip && r.extra.type) return r.extra.type;
    }
    return '';
  }
  const typeOf = (ip) => analyze.classifyIP(geoOf(ip), identTypeOf(ip));

  const riskRequested = new Set();
  function ensureRisk(ip) {
    if (!ip || riskRequested.has(ip)) return;
    riskRequested.add(ip);
    risk.assess(ip, identTypeOf(ip)).then((r) => {
      if (r) state.risk.set(ip, r);
      notify();
    });
  }

  const isFinished = () => state.total > 0 && state.done === state.total;

  // ---------------- 调度 ----------------

  function runConn(alive, onEach) {
    return util.pool(connectivity.sites, 4, async (site) => {
      if (!alive()) return;
      const r = await connectivity.probe(site);
      if (!alive()) return;
      state.conn.set(site.id, r);
      onEach();
    });
  }

  function start() {
    const run = ++state.run;
    const alive = () => run === state.run;
    state.results.clear();
    state.order.clear();
    state.rtc.clear();
    state.conn.clear();
    state.dns = null;
    state.done = 0;
    state.finished = 0;
    state.connBusy = false;
    state.started = performance.now();
    state.total = sources.list.length + webrtc.servers.length + 1 + connectivity.sites.length;
    const connToken = ++state.connRun;

    const tick = () => {
      if (++state.done === state.total) state.finished = performance.now();
      notify();
    };

    const ipJobs = sources.list.map((s) => sources.run(s).then((r) => {
      if (!alive()) return;
      state.results.set(s.id, r);
      if (r.ok) {
        if (!state.order.has(r.ip)) state.order.set(r.ip, state.order.size);
        ensureGeo(r.ip);
      }
      tick();
    }));

    webrtc.servers.forEach((server) => webrtc.probe(server).then((r) => {
      if (!alive()) return;
      state.rtc.set(server.id, r);
      r.publicIPs.forEach(ensureGeo);
      tick();
    }));

    dns.run().then((d) => {
      if (!alive()) return;
      state.dns = d;
      d.resolvers.forEach((x) => ensureGeo(x.ip));
      tick();
    });

    // IP 检测结束后再测连通性，避免几十个并发请求干扰延迟数据
    Promise.all(ipJobs).then(() => runConn(() => alive() && connToken === state.connRun, tick));

    if (!state.fp) {
      fp.collect().then((f) => {
        state.fp = f;
        notify();
      });
    }
    notify();
  }

  /** 只重测连通性（主检测进行中时忽略） */
  function rerunConn() {
    if (!isFinished() || state.connBusy) return;
    const token = ++state.connRun;
    state.conn.clear();
    state.connBusy = true;
    notify();
    runConn(() => token === state.connRun, notify).then(() => {
      if (token === state.connRun) {
        state.connBusy = false;
        notify();
      }
    });
  }

  function setMask(on) {
    state.mask = !!on;
    notify();
  }

  // ---------------- 快照 ----------------

  /** 一组 IP 的国家代码（只取已有归属地的；一个都没有时返回 null） */
  function ccsOf(ips) {
    const ccs = ips.map((ip) => geoOf(ip)).filter((g) => g && g.cc).map((g) => g.cc);
    return ccs.length ? ccs : null;
  }

  function connStatus(id) {
    const r = state.conn.get(id);
    return r ? (r.ok ? 'ok' : 'fail') : null;
  }

  function snapshot() {
    const rows = sources.list.map((meta) => ({ meta, result: state.results.get(meta.id) }));
    const done = rows
      .filter((x) => x.result)
      .map(({ meta, result }) => ({ ...result, name: meta.name, group: meta.group }));
    const exits = analyze.exits(done, state.order);
    const route = analyze.routing(done);
    const v6Exits = exits.filter((e) => e.family === 'v6').map((e) => e.ip);
    const rtc = webrtc.servers.map((server) => ({ server, result: state.rtc.get(server.id) }));
    const rtcDone = rtc.every((x) => x.result);
    const intlGeo = route.intlExit ? geoOf(route.intlExit) : null;

    const chinaSignals = china.signals({
      timeZone: state.fp ? state.fp.timeZone : null,
      languages: state.fp ? state.fp.languages : null,
      fonts: state.fp ? state.fp.fonts : null,
      intlExitCC: intlGeo && intlGeo.cc ? intlGeo.cc : null,
      exitCCs: ccsOf(exits.filter((e) => e.family === 'v4').map((e) => e.ip)),
      webrtcCCs: rtcDone ? ccsOf(rtc.flatMap((x) => x.result.publicIPs)) : null,
      dnsCCs: state.dns ? ccsOf(state.dns.resolvers.map((r) => r.ip)) : null,
      google: connStatus('google'),
      baidu: connStatus('baidu'),
    });

    return {
      rows, done, exits, route, rtc,
      finished: isFinished(),
      exitByIP: new Map(exits.map((e) => [e.ip, e])),
      rtcVerdict: analyze.webrtcVerdict(rtcDone ? rtc.map((x) => x.result) : null, route, v6Exits),
      dns: state.dns,
      dnsVerdict: analyze.dnsVerdict(state.dns, route, geoOf),
      ai: analyze.aiVerdict(rows.map(({ meta, result }) => ({ name: meta.name, ai: meta.ai, result }))),
      conn: connectivity.sites.map((site) => ({ site, result: state.conn.get(site.id) })),
      connBusy: state.connBusy,
      chinaSignals,
      china: china.evaluate(chinaSignals),
      fp: state.fp,
    };
  }

  const view = () => state.view || (state.view = snapshot());

  SafeIP.core = {
    state, start, rerunConn, setMask, on, view, fmt, geoOf, riskOf, typeOf, identTypeOf,
    ensureGeo, ensureRisk, isFinished,
  };
})(window);

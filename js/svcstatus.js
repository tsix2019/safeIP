/* SafeIP · svcstatus.js — 主流服务的官方状态页（Statuspage 接口与 Google Cloud incidents） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const SERVICES = [
    { id: 'openai', name: 'OpenAI / ChatGPT', page: 'https://status.openai.com', kind: 'statuspage' },
    { id: 'claude', name: 'Claude / Anthropic', page: 'https://status.claude.com', kind: 'statuspage' },
    { id: 'github', name: 'GitHub', page: 'https://www.githubstatus.com', kind: 'statuspage' },
    { id: 'cloudflare', name: 'Cloudflare', page: 'https://www.cloudflarestatus.com', kind: 'statuspage' },
    { id: 'discord', name: 'Discord', page: 'https://discordstatus.com', kind: 'statuspage' },
    { id: 'gcloud', name: 'Google Cloud / Gemini', page: 'https://status.cloud.google.com', kind: 'gcloud' },
  ];

  const INDICATOR_STATUS = { none: 'good', minor: 'warning', major: 'serious', critical: 'critical', maintenance: 'info' };
  const INDICATOR_TEXT = {
    none: '全部正常', minor: '部分服务受影响', major: '服务严重中断', critical: '大面积中断', maintenance: '维护中',
  };
  const COMPONENT_TEXT = {
    operational: '正常', degraded_performance: '性能下降', partial_outage: '部分中断',
    major_outage: '严重中断', under_maintenance: '维护中',
  };
  const INCIDENT_TEXT = {
    investigating: '调查中', identified: '已定位', monitoring: '观察中', resolved: '已解决',
    postmortem: '复盘', scheduled: '已计划', in_progress: '进行中', verifying: '验证中', completed: '已完成',
  };

  /** 纯函数：Statuspage summary.json → 统一结构 */
  function parseStatuspage(s, page) {
    const indicator = (s.status && s.status.indicator) || 'none';
    const all = s.components || [];
    return {
      indicator,
      st: INDICATOR_STATUS[indicator] || 'info',
      text: INDICATOR_TEXT[indicator] || indicator,
      description: (s.status && s.status.description) || '',
      incidents: (s.incidents || []).map((i) => ({
        name: i.name, status: INCIDENT_TEXT[i.status] || i.status, impact: i.impact,
        url: i.shortlink || page, updated: i.updated_at,
      })),
      maintenances: (s.scheduled_maintenances || [])
        .filter((m) => m.status !== 'completed')
        .map((m) => ({ name: m.name, status: INCIDENT_TEXT[m.status] || m.status, url: m.shortlink || page, at: m.scheduled_for })),
      components: all.filter((c) => !c.group_id).slice(0, 12).map((c) => ({ name: c.name, status: c.status, text: COMPONENT_TEXT[c.status] || c.status })),
      broken: all.filter((c) => c.status && c.status !== 'operational')
        .slice(0, 10).map((c) => ({ name: c.name, status: c.status, text: COMPONENT_TEXT[c.status] || c.status })),
      updated: (s.page && s.page.updated_at) || '',
    };
  }

  /** 纯函数：Google Cloud incidents.json → 统一结构（只看尚未结束的事件） */
  function parseGcloud(list) {
    const active = (list || []).filter((i) => !i.end);
    const indicator = active.some((i) => i.severity === 'high') ? 'major' : active.length ? 'minor' : 'none';
    return {
      indicator,
      st: INDICATOR_STATUS[indicator],
      text: INDICATOR_TEXT[indicator],
      description: active.length ? `${active.length} 个进行中的事件` : '',
      incidents: active.slice(0, 6).map((i) => ({
        name: util.clean(i.external_desc),
        status: (i.most_recent_update && i.most_recent_update.status) || '',
        impact: i.severity,
        url: i.uri ? `https://status.cloud.google.com/${i.uri}` : 'https://status.cloud.google.com',
        updated: i.modified,
      })),
      maintenances: [],
      components: [],
      broken: active.slice(0, 10).map((i) => ({
        name: (i.affected_products || []).map((p) => p.title).join('、') || i.service_name || '',
        status: 'partial_outage',
        text: COMPONENT_TEXT.partial_outage,
      })),
      updated: active.length ? active[0].modified : '',
    };
  }

  async function check(svc) {
    try {
      if (svc.kind === 'gcloud') {
        const { data } = await util.request(`${svc.page}/incidents.json`, { timeout: 20000 });
        return { id: svc.id, ok: true, ...parseGcloud(data) };
      }
      const { data } = await util.request(`${svc.page}/api/v2/summary.json`, { timeout: 15000 });
      return { id: svc.id, ok: true, ...parseStatuspage(data, svc.page) };
    } catch (e) {
      return { id: svc.id, ok: false, error: typeof e.code === 'string' ? e.code : 'network' };
    }
  }

  const cache = new Map();
  /** 查询某个服务的状态；同一会话 2 分钟内复用结果 */
  function get(id, { fresh = false } = {}) {
    const svc = SERVICES.find((s) => s.id === id);
    const hit = cache.get(id);
    if (!fresh && hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = check(svc);
    cache.set(id, { at: Date.now(), promise });
    return promise;
  }

  SafeIP.svcstatus = { SERVICES, COMPONENT_TEXT, parseStatuspage, parseGcloud, get };
})(typeof window !== 'undefined' ? window : globalThis);

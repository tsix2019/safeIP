/* SafeIP · ui.js — 页面公共组件（返回 HTML 字符串；第三方文本一律转义） */
(function (root) {
  'use strict';
  const SafeIP = root.SafeIP;
  const { util, core } = SafeIP;
  SafeIP.pages = SafeIP.pages || {}; // 页面脚本在 router.js 之前加载，先建好注册表

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /** 手绘的简单线性图标（24×24，描边） */
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    route: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4.5-6 3.5-11 7"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.4"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    radio: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="2"/>',
    cloud: '<path d="M7 18h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.3A3.5 3.5 0 0 0 7 18z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-2.8 3-2.8 15 0 18M12 3c2.8 3 2.8 15 0 18"/>',
    fingerprint: '<path d="M7.5 5.6A7 7 0 0 1 19 11v1.5"/><path d="M5 9.5A7 7 0 0 0 5 12c0 3 .7 5.6 2 7.5"/><path d="M8.5 13c0-2.2 1.6-4 3.5-4s3.5 1.8 3.5 4v1c0 2.4.6 4.4 1.6 6"/><path d="M12 13v1.5c0 2.4.8 4.6 2 6.3"/><path d="M9 17c.3 1.3.8 2.5 1.5 3.5"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
    pulse: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    network: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5-9 9"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4"/>',
    hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /** muted = 进行中（转圈）；unknown = 已结束但无结果（问号） */
  const STATUS_GLYPH = { good: '✓', warning: '!', serious: '!', critical: '✕', info: 'i', unknown: '?', muted: '' };
  const statusIcon = (st) => `<span class="st-icon st-${st}" aria-hidden="true">${STATUS_GLYPH[st] || ''}</span>`;

  const SKELETON = '<span class="skel w60"></span><span class="skel w80"></span><span class="skel w40"></span>';
  const exitClass = (e) => (e.index < 8 ? `x${e.index}` : 'xn');
  const exitTag = (e) => `<span class="xtag ${exitClass(e)}" title="出口 ${e.label}"><i></i>${e.label}</span>`;
  const exitPill = (e) => `<span class="xtag pill ${exitClass(e)}"><i></i>出口 ${e.label}</span>`;
  const ipText = (ip) => `<span class="mono">${esc(core.fmt(ip))}</span>`;
  const copyBtn = (ip) => `<button type="button" class="icon-btn" data-copy="${esc(core.fmt(ip))}" aria-label="复制" title="复制">${icon('copy')}</button>`;
  const ccBadge = (cc) => (cc ? `<span class="cc" title="${esc(util.countryName(cc))}">${esc(cc)}</span>` : '');
  const avatar = (name) => `<span class="avatar" aria-hidden="true">${esc(Array.from(String(name || '?'))[0].toUpperCase())}</span>`;
  const iconAvatar = (name) => `<span class="avatar" aria-hidden="true">${icon(name)}</span>`;
  const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return esc(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function itemHead(name, host, right = '', avatarHTML = avatar(name)) {
    return `<div class="item-head">${avatarHTML}<div class="item-name"><b title="${esc(name)}">${esc(name)}</b><span class="host" title="${esc(host)}">${esc(host)}</span></div>${right}</div>`;
  }

  const callout = (st, title, text, extra = '') => `<div class="callout st-${st}">${statusIcon(st)}<div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${extra}</div></div>`;

  const subhead = (title, count = '', desc = '') => `<div class="subhead"><h3>${esc(title)}</h3>${desc ? `<span class="desc">${esc(desc)}</span>` : ''}${count ? `<span class="count">${esc(count)}</span>` : ''}</div>`;

  /** 页面标题区。actions 为已转义的 HTML */
  const pageHead = ({ icon: ic, title, desc, actions = '' }) => `<header class="page-head">
      <span class="section-icon" aria-hidden="true">${icon(ic)}</span>
      <div class="page-title"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}</div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </header>`;

  /** 键值表：rows 为 [标签, 已转义的值 HTML] */
  const kvTable = (rows) => `<dl class="kv-table">${rows
    .filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '')
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  /** 横向分数条（0–100），st 为状态色 */
  const meter = (value, st) => `<div class="meter st-${st}" role="img" aria-label="${value} / 100"><i data-w="${Math.max(2, Math.min(100, value))}"></i></div>`;

  /** CSP 禁止内联 style 属性：带 data-w / data-h 的元素在插入后用 CSSOM 设置尺寸 */
  function applySizes(el) {
    el.querySelectorAll('[data-w]').forEach((x) => { x.style.width = `${x.dataset.w}%`; });
    el.querySelectorAll('[data-h]').forEach((x) => { x.style.height = `${x.dataset.h}%`; });
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'offscreen';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e2) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  SafeIP.ui = {
    esc, icon, statusIcon, SKELETON, exitClass, exitTag, exitPill, ipText, copyBtn, ccBadge, avatar, iconAvatar,
    fmtMs, fmtTime, itemHead, callout, subhead, pageHead, kvTable, meter, applySizes, toast, copyText,
  };
})(window);

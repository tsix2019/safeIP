/* SafeIP · ipcard.js — 用 Canvas 绘制可分享的 IP 卡片（1200×630，深色） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});

  const W = 1200;
  const H = 630;
  const PAD = 56;
  const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  const MONO = 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace';
  const C = {
    ink: '#f3f5f8',
    ink2: '#c3cad4',
    muted: '#8a94a3',
    line: 'rgba(255, 255, 255, 0.10)',
    panel: 'rgba(255, 255, 255, 0.05)',
    accent: '#3987e5',
    // 与页面深色主题一致的出口身份色
    exits: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    st: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', info: '#3987e5', muted: '#8a94a3' },
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 超出宽度时截断并补省略号 */
  function fit(ctx, text, maxW) {
    let s = String(text || '');
    if (ctx.measureText(s).width <= maxW) return s;
    while (s && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
  }

  function text(ctx, s, x, y, { size = 16, weight = 400, color = C.ink, font = FONT, maxW, align = 'left' } = {}) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(maxW ? fit(ctx, s, maxW) : s, x, y);
    ctx.textAlign = 'left';
  }

  function logo(ctx, x, y, s) {
    roundRect(ctx, x, y, s, s, s * 0.28);
    ctx.fillStyle = C.accent;
    ctx.fill();
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r = s * 0.29;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = s * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * 绘制卡片。d: {
   *   title, time, masked,
   *   exits: [{ label, index, family, ip, location, isp, type }],
   *   tiles: [{ name, status, st }]
   * }
   */
  function draw(canvas, d) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(1, '#111a2e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(140, 60, 0, 140, 60, 520);
    glow.addColorStop(0, 'rgba(57, 135, 229, 0.28)');
    glow.addColorStop(1, 'rgba(57, 135, 229, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = 'alphabetic';
    logo(ctx, PAD, 44, 44);
    text(ctx, 'SafeIP', PAD + 58, 66, { size: 24, weight: 700 });
    text(ctx, '全球 IP 分流检测', PAD + 58, 88, { size: 14, color: C.muted });
    text(ctx, d.time || '', W - PAD, 66, { size: 15, color: C.muted, align: 'right' });

    text(ctx, d.title || '检测中…', PAD, 158, { size: 40, weight: 700, maxW: W - PAD * 2 });

    const exits = (d.exits || []).slice(0, 3);
    const rowH = 88;
    exits.forEach((e, i) => {
      const y = 190 + i * rowH;
      roundRect(ctx, PAD, y, W - PAD * 2, rowH - 12, 14);
      ctx.fillStyle = C.panel;
      ctx.fill();
      roundRect(ctx, PAD, y, 6, rowH - 12, 3);
      ctx.fillStyle = C.exits[e.index] || C.muted;
      ctx.fill();
      text(ctx, `出口 ${e.label}`, PAD + 24, y + 30, { size: 15, weight: 700, color: C.ink2 });
      text(ctx, e.family === 'v6' ? 'IPv6' : 'IPv4', PAD + 24, y + 56, { size: 13, color: C.muted });
      text(ctx, e.ip, PAD + 110, y + 48, { size: 30, weight: 700, font: MONO, maxW: 420 });
      text(ctx, e.location || '', PAD + 560, y + 32, { size: 18, color: C.ink, maxW: W - PAD * 2 - 580 });
      text(ctx, [e.isp, e.type].filter(Boolean).join(' · '), PAD + 560, y + 58, { size: 15, color: C.muted, maxW: W - PAD * 2 - 580 });
    });
    if ((d.exits || []).length > 3) {
      text(ctx, `另有 ${d.exits.length - 3} 个出口`, PAD, 190 + 3 * rowH + 8, { size: 14, color: C.muted });
    }

    const tiles = d.tiles || [];
    const gap = 12;
    const tw = (W - PAD * 2 - gap * (tiles.length - 1)) / Math.max(tiles.length, 1);
    tiles.forEach((t, i) => {
      const x = PAD + i * (tw + gap);
      const y = 468;
      roundRect(ctx, x, y, tw, 84, 12);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      text(ctx, t.name, x + 16, y + 30, { size: 14, color: C.muted, maxW: tw - 32 });
      ctx.beginPath();
      ctx.arc(x + 22, y + 56, 6, 0, Math.PI * 2);
      ctx.fillStyle = C.st[t.st] || C.muted;
      ctx.fill();
      text(ctx, t.status, x + 36, y + 62, { size: 18, weight: 700, maxW: tw - 52 });
    });

    text(ctx, 'github.com/tsix2019/safeIP', PAD, H - 30, { size: 14, color: C.muted });
    if (d.masked) text(ctx, 'IP 已打码', W - PAD, H - 30, { size: 14, color: C.muted, align: 'right' });
  }

  SafeIP.ipcard = { W, H, draw };
})(typeof window !== 'undefined' ? window : globalThis);

/* SafeIP · fingerprint.js — 浏览器指纹采集（全部本地计算，不上传）与一致性检查 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const CN_FONTS = [
    'Microsoft YaHei', 'SimSun', 'SimHei', 'DengXian', 'KaiTi', 'FangSong', 'PingFang SC', 'Hiragino Sans GB',
    'STHeiti', 'Songti SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei',
  ];
  const FONT_LIST = [
    ...CN_FONTS,
    'Microsoft JhengHei', 'PMingLiU', 'MS Gothic', 'Yu Gothic', 'Meiryo', 'Malgun Gothic', 'Apple SD Gothic Neo',
    'Arial', 'Helvetica', 'Helvetica Neue', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Courier New',
    'Segoe UI', 'Calibri', 'Cambria', 'Consolas', 'Roboto', 'Ubuntu', 'Cantarell', 'DejaVu Sans', 'Menlo', 'Monaco', 'SF Pro Text',
  ];

  /** 常见时区 → 国家代码（用于和出口 IP 所在地比对） */
  const TZ_CC = {
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Chungking': 'CN', 'Asia/Harbin': 'CN', 'Asia/Urumqi': 'CN',
    'Asia/Kashgar': 'CN', PRC: 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'MO', 'Asia/Taipei': 'TW',
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH',
    'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Kolkata': 'IN',
    'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Jerusalem': 'IL', 'Asia/Riyadh': 'SA', 'Asia/Tehran': 'IR',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR', 'Europe/Kiev': 'UA',
    'Europe/Kyiv': 'UA', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
    'America/Argentina/Buenos_Aires': 'AR', 'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
    'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
    'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Lagos': 'NG',
  };

  const tzCountry = (tz) => TZ_CC[tz] || '';
  /** 语言标签中的地区：zh-CN → CN，en-Latn-US → US，zh-Hans → '' */
  const langCountry = (lang) => {
    const m = /-([a-z]{2})(?:-|$)/i.exec(String(lang || '').replace(/-[a-z]{4}(?=-|$)/i, ''));
    return m ? m[1].toUpperCase() : '';
  };

  function detectFonts() {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      const sample = 'mmmmmmmmmmlli WwQq 你好世界 0123';
      const bases = ['monospace', 'serif', 'sans-serif'];
      const width = (font) => {
        ctx.font = `72px ${font}`;
        return ctx.measureText(sample).width;
      };
      const baseW = bases.map(width);
      return FONT_LIST.filter((f) => bases.some((b, i) => width(`"${f}", ${b}`) !== baseW[i]));
    } catch (e) {
      return [];
    }
  }

  function canvasHash() {
    try {
      const c = document.createElement('canvas');
      c.width = 280;
      c.height = 60;
      const x = c.getContext('2d');
      x.textBaseline = 'top';
      x.font = '16px Arial';
      x.fillStyle = '#f60';
      x.fillRect(100, 1, 62, 20);
      x.fillStyle = '#069';
      x.fillText('SafeIP 指纹 ✓ 🌏', 2, 15);
      x.fillStyle = 'rgba(102, 204, 0, 0.7)';
      x.fillText('SafeIP 指纹 ✓ 🌏', 4, 17);
      x.beginPath();
      x.arc(240, 30, 20, 0, Math.PI * 2);
      x.stroke();
      return util.hash(c.toDataURL());
    } catch (e) {
      return '';
    }
  }

  function webgl() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const version = gl.getParameter(gl.VERSION);
      const extra = [gl.getParameter(gl.SHADING_LANGUAGE_VERSION), gl.getParameter(gl.MAX_TEXTURE_SIZE), (gl.getSupportedExtensions() || []).join(',')];
      return { vendor, renderer, version, hash: util.hash([vendor, renderer, version, ...extra].join('|')) };
    } catch (e) {
      return null;
    }
  }

  async function audioHash() {
    try {
      const Ctx = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      if (!Ctx) return '';
      const ctx = new Ctx(1, 5000, 44100);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50;
      comp.knee.value = 40;
      comp.ratio.value = 12;
      comp.attack.value = 0;
      comp.release.value = 0.25;
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      const buf = await ctx.startRendering();
      const data = buf.getChannelData(0);
      let sum = 0;
      for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
      return util.hash(sum.toString());
    } catch (e) {
      return '';
    }
  }

  async function uaData() {
    const d = navigator.userAgentData;
    if (!d) return null;
    let high = {};
    try {
      high = await d.getHighEntropyValues(['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']);
    } catch (e) { /* 部分浏览器拒绝高熵信息 */ }
    return {
      brands: (high.fullVersionList || d.brands || []).filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`),
      mobile: d.mobile,
      platform: d.platform,
      platformVersion: high.platformVersion || '',
      architecture: [high.architecture, high.bitness && `${high.bitness} 位`].filter(Boolean).join(' · '),
      model: high.model || '',
    };
  }

  /** 采集指纹（异步，约 100～300ms） */
  async function collect() {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    const fonts = detectFonts();
    const [ch, audio] = await Promise.all([uaData(), audioHash()]);
    const gl = webgl();
    const canvas = canvasHash();
    const s = root.screen || {};
    const mm = (q) => !!(root.matchMedia && root.matchMedia(q).matches);
    const fp = {
      ua: navigator.userAgent,
      ch,
      platform: navigator.platform || '',
      vendor: navigator.vendor || '',
      languages: [...(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])],
      timeZone: opts.timeZone || '',
      locale: opts.locale || '',
      calendar: opts.calendar || '',
      tzOffset: -new Date().getTimezoneOffset(),
      screen: { w: s.width, h: s.height, aw: s.availWidth, ah: s.availHeight, depth: s.colorDepth, dpr: root.devicePixelRatio },
      cores: navigator.hardwareConcurrency || null,
      memory: navigator.deviceMemory || null,
      touch: navigator.maxTouchPoints || 0,
      cookies: navigator.cookieEnabled,
      dnt: navigator.doNotTrack === '1' || root.doNotTrack === '1',
      gpc: !!navigator.globalPrivacyControl,
      webdriver: !!navigator.webdriver,
      colorScheme: mm('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      reducedMotion: mm('(prefers-reduced-motion: reduce)'),
      gl,
      canvas,
      audio,
      fonts,
    };
    fp.id = util.hash([
      fp.ua, fp.platform, fp.languages.join(','), fp.timeZone, `${s.width}x${s.height}x${s.colorDepth}`,
      fp.cores, fp.memory, gl && gl.hash, canvas, audio, fonts.join(','),
    ].join('|'));
    return fp;
  }

  const platformFamily = (s) => {
    const v = String(s || '').toLowerCase();
    if (/win/.test(v)) return 'windows';
    if (/mac/.test(v)) return 'mac';
    if (/android/.test(v)) return 'android';
    if (/iphone|ipad|ios/.test(v)) return 'ios';
    if (/cros|chrome ?os/.test(v)) return 'chromeos';
    if (/linux|x11/.test(v)) return 'linux';
    return v;
  };

  /**
   * 纯函数：一致性检查。ctx: { exitCC }（国外主出口的国家代码）
   * 返回 [{ st, title, detail }]
   */
  function consistency(fp, ctx = {}) {
    const name = util.countryName;
    const out = [];
    const tzCC = tzCountry(fp.timeZone);
    if (ctx.exitCC && tzCC) {
      if (tzCC !== ctx.exitCC) {
        out.push({
          st: 'warning', title: '时区与出口 IP 所在地不一致',
          detail: `系统时区 ${fp.timeZone}（${name(tzCC)}），国外出口位于${name(ctx.exitCC)}。网站可据此推断你在使用代理。`,
        });
      } else {
        out.push({ st: 'good', title: '时区与出口 IP 所在地一致', detail: `${fp.timeZone} · ${name(tzCC)}` });
      }
    }
    const lang = fp.languages[0] || '';
    const langCC = langCountry(lang);
    if (ctx.exitCC && langCC && langCC !== ctx.exitCC) {
      out.push({
        st: 'info', title: '首选语言的地区与出口不同',
        detail: `首选语言 ${lang}，国外出口位于${name(ctx.exitCC)}。使用外语很常见，单独出现时风险较低。`,
      });
    }
    if (fp.ch && fp.ch.platform && platformFamily(fp.platform) !== platformFamily(fp.ch.platform)
      && !(platformFamily(fp.ch.platform) === 'android' && platformFamily(fp.platform) === 'linux')) {
      out.push({
        st: 'warning', title: 'User-Agent 平台信息互相矛盾',
        detail: `navigator.platform 为 ${fp.platform}，UA-CH 为 ${fp.ch.platform}，可能修改过 User-Agent。`,
      });
    }
    if (fp.webdriver) {
      out.push({ st: 'critical', title: '检测到自动化浏览器', detail: 'navigator.webdriver 为 true，网站会把你当作机器人。' });
    }
    return out;
  }

  SafeIP.fp = { CN_FONTS, TZ_CC, tzCountry, langCountry, collect, consistency };
})(typeof window !== 'undefined' ? window : globalThis);

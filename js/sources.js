/* SafeIP · sources.js — IP 检测源清单（均已实测支持 CORS 或 JSONP）与执行 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;
  const { place } = util;

  const GROUPS = {
    cn: { title: '国内服务', desc: '国内服务商看到的 IP' },
    intl: { title: '国外服务', desc: '海外 IP 查询服务看到的 IP' },
    site: { title: '网站视角', desc: '这些网站实际看到的 IP 与判定的国家（Cloudflare trace）' },
    v6: { title: 'IPv6', desc: '仅走 IPv6 的检测接口' },
  };

  // ---- 共用解析函数 ----
  const plainIP = (text) => ({ ip: String(text).trim() });

  const fromTrace = (text) => {
    const t = util.parseTrace(text);
    return { ip: t.ip, cc: t.loc, extra: { loc: t.loc, colo: t.colo, warp: t.warp } };
  };

  const fromIpsb = (d) => ({
    ip: d.ip,
    cc: d.country_code,
    location: place(d.country, d.region, d.city),
    isp: d.isp || d.organization,
    extra: { asn: d.asn, asnName: d.asn_organization },
  });

  const fromIdent = (d) => ({
    ip: d.ip,
    cc: d.cc,
    location: place(d.country, d.city),
    isp: d.aso,
    extra: { asn: d.asn, type: d.type },
  });

  const list = [
    // ---------------- 国内服务 ----------------
    {
      id: 'ipip', name: 'IPIP.net', host: 'myip.ipip.net', group: 'cn', method: 'json',
      url: 'https://myip.ipip.net/json',
      parse: (d) => {
        const l = (d.data && d.data.location) || [];
        return { ip: d.data && d.data.ip, location: place(l[0], l[1], l[2]), isp: l[4] || l[3] };
      },
    },
    {
      id: 'upyun', name: '又拍云', host: 'pubstatic.b0.upaiyun.com', group: 'cn', method: 'json',
      url: 'https://pubstatic.b0.upaiyun.com/?_upnode',
      parse: (d) => {
        const l = d.remote_addr_location || {};
        return { ip: d.remote_addr, location: place(l.country, l.province, l.city), isp: l.isp };
      },
    },
    {
      id: 'dnspod', name: 'DNSPod', host: 'ipv4.ddnspod.com', group: 'cn', method: 'text',
      url: 'https://ipv4.ddnspod.com',
      parse: plainIP,
    },
    {
      id: 'netease', name: '网易', host: 'ipservice.ws.126.net', group: 'cn', method: 'jsonp',
      url: 'https://ipservice.ws.126.net/locate/api/getLocByIp?callback={cb}',
      parse: (d) => {
        const r = d.result || {};
        return {
          ip: r.ip, cc: r.countrySymbol,
          location: place(r.country, r.province, r.city), isp: r.operator || r.company,
        };
      },
    },
    {
      id: 'pconline', name: '太平洋电脑网', host: 'whois.pconline.com.cn', group: 'cn', method: 'jsonp',
      url: 'https://whois.pconline.com.cn/ipJson.jsp?callback={cb}',
      parse: (d) => {
        const [loc, isp] = String(d.addr || '').trim().split(/\s+/);
        return { ip: d.ip, location: loc || '', isp: isp || '' };
      },
    },
    {
      id: 'qqvideo', name: '腾讯视频', host: 'vv.video.qq.com', group: 'cn', method: 'scriptvar',
      url: 'https://vv.video.qq.com/checktime?otype=json', varName: 'QZOutputJson',
      parse: (d) => ({ ip: d.ip }),
    },
    {
      id: 'zxinc', name: 'ZXInc', host: 'ip.zxinc.org', group: 'cn', method: 'json',
      url: 'https://ip.zxinc.org/api.php?type=json',
      parse: (d) => {
        const x = d.data || {};
        return { ip: x.myip, location: place(...String(x.country || '').split('–')), isp: util.clean(x.local) };
      },
    },

    // ---------------- 国外服务 ----------------
    {
      id: 'cloudflare', name: 'Cloudflare', host: 'www.cloudflare.com', group: 'intl', method: 'text',
      url: 'https://www.cloudflare.com/cdn-cgi/trace',
      parse: fromTrace,
    },
    {
      id: 'ipify', name: 'ipify', host: 'api4.ipify.org', group: 'intl', method: 'json',
      url: 'https://api4.ipify.org?format=json',
      parse: (d) => ({ ip: d.ip }),
    },
    {
      id: 'ipsb', name: 'IP.SB', host: 'api.ip.sb', group: 'intl', method: 'json',
      url: 'https://api.ip.sb/geoip',
      parse: fromIpsb,
    },
    {
      id: 'ipinfo', name: 'ipinfo', host: 'ipinfo.io', group: 'intl', method: 'json',
      url: 'https://ipinfo.io/json',
      parse: (d) => ({ ip: d.ip, cc: d.country, location: place(d.country, d.region, d.city), isp: d.org }),
    },
    {
      id: 'ipwhois', name: 'ipwho.is', host: 'ipwho.is', group: 'intl', method: 'json',
      url: 'https://ipwho.is/',
      parse: (d) => {
        const c = d.connection || {};
        return {
          ip: d.ip, cc: d.country_code,
          location: place(d.country, d.region, d.city), isp: c.isp || c.org,
        };
      },
    },
    {
      id: 'identme', name: 'ident.me', host: 'v4.ident.me', group: 'intl', method: 'json',
      url: 'https://v4.ident.me/json',
      parse: fromIdent,
    },
    {
      id: 'ipleak', name: 'ipleak.net', host: 'ipleak.net', group: 'intl', method: 'json',
      url: 'https://ipleak.net/json/',
      parse: (d) => ({
        ip: d.ip, cc: d.country_code,
        location: place(d.country_name, d.region_name, d.city_name), isp: d.isp_name,
      }),
    },
  ];

  // ---------------- 网站视角：Cloudflare trace ----------------
  [
    ['chatgpt', 'ChatGPT', 'chatgpt.com', true],
    ['openai', 'OpenAI', 'openai.com', true],
    ['claude', 'Claude', 'claude.ai', true],
    ['grok', 'Grok', 'grok.com', true],
    ['x', 'X (Twitter)', 'x.com', false],
    ['notion', 'Notion', 'www.notion.so', false],
    ['npm', 'npm', 'www.npmjs.com', false],
  ].forEach(([id, name, host, ai]) => {
    list.push({
      id, name, host, ai, group: 'site', method: 'text',
      url: `https://${host}/cdn-cgi/trace`,
      parse: fromTrace,
    });
  });

  // ---------------- IPv6 ----------------
  list.push(
    {
      id: 'ipify6', name: 'ipify', host: 'api6.ipify.org', group: 'v6', method: 'json',
      url: 'https://api6.ipify.org?format=json',
      parse: (d) => ({ ip: d.ip }),
    },
    {
      id: 'ipsb6', name: 'IP.SB', host: 'api-ipv6.ip.sb', group: 'v6', method: 'json',
      url: 'https://api-ipv6.ip.sb/geoip',
      parse: fromIpsb,
    },
    {
      id: 'identme6', name: 'ident.me', host: 'v6.ident.me', group: 'v6', method: 'json',
      url: 'https://v6.ident.me/json',
      parse: fromIdent,
    },
    {
      id: 'icanhazip6', name: 'icanhazip', host: 'ipv6.icanhazip.com', group: 'v6', method: 'text',
      url: 'https://ipv6.icanhazip.com',
      parse: plainIP,
    },
    {
      id: 'dnspod6', name: 'DNSPod（国内）', host: 'ipv6.ddnspod.com', group: 'v6', method: 'text',
      url: 'https://ipv6.ddnspod.com',
      parse: plainIP,
    }
  );

  const byId = new Map(list.map((s) => [s.id, s]));

  /** 走代理的国内源实测要 6~8 秒，留足余量 */
  const TIMEOUT = 12000;

  async function fetchRaw(source) {
    if (source.method === 'jsonp') return util.jsonp(source.url, { timeout: TIMEOUT });
    if (source.method === 'scriptvar') {
      // script 标签无法设置 no-store，加时间戳防止拿到缓存的旧 IP
      const sep = source.url.includes('?') ? '&' : '?';
      return util.scriptVar(`${source.url}${sep}_=${Date.now()}`, source.varName, { timeout: TIMEOUT });
    }
    return util.request(source.url, { as: source.method === 'text' ? 'text' : 'json', timeout: TIMEOUT });
  }

  /** 执行一个检测源，永不抛错：返回 { id, ok, ip, family, location, isp, cc, extra, ms, error } */
  async function run(source) {
    try {
      const res = await fetchRaw(source);
      let parsed;
      try {
        parsed = source.parse(res.data) || {};
      } catch (e) {
        throw util.makeError('parse');
      }
      const ip = typeof parsed.ip === 'string' ? parsed.ip.trim() : '';
      const family = util.ipFamily(ip);
      if (!family) throw util.makeError('parse');
      if (source.group === 'v6' && family !== 'v6') throw util.makeError('family');
      return {
        id: source.id, ok: true, ip, family,
        location: parsed.location || '', isp: parsed.isp || '',
        cc: String(parsed.cc || '').toUpperCase(), extra: parsed.extra || {}, ms: res.ms,
      };
    } catch (e) {
      return { id: source.id, ok: false, error: typeof e.code === 'string' ? e.code : 'network' };
    }
  }

  SafeIP.sources = { GROUPS, list, byId, run };
})(typeof window !== 'undefined' ? window : globalThis);

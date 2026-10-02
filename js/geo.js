/* SafeIP · geo.js — IP 归属地 / 属性查询：多源合并，按 IP 缓存 */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;
  const { place } = util;

  /** 页面为 https 时，http 接口会被浏览器当作混合内容拦截 */
  const httpAllowed = () => !(root.location && root.location.protocol === 'https:');

  const parseAS = (s) => {
    const m = /^AS(\d+)\s*(.*)$/i.exec(String(s || '').trim());
    return m ? { asn: Number(m[1]), asnName: m[2] } : { asn: null, asnName: '' };
  };

  const enc = encodeURIComponent;

  /** 各提供方：返回统一字段 { cc, location, locationEn, isp, asn, asnName, flags } 的子集 */
  const providers = {
    async zxinc(ip) {
      const { data } = await util.request(`https://ip.zxinc.org/api.php?type=json&ip=${enc(ip)}`);
      const x = (data && data.data) || {};
      if (data.code !== 0 || !x.country) throw util.makeError('parse');
      return { location: place(...String(x.country).split('–')), isp: util.clean(x.local) };
    },
    async baidu(ip) {
      const { data } = await util.jsonp(
        `https://opendata.baidu.com/api.php?query=${enc(ip)}&resource_id=6006&oe=utf8&format=json&cb={cb}`
      );
      const item = data && data.data && data.data[0];
      if (!item || !item.location) throw util.makeError('parse');
      const [loc, isp] = String(item.location).trim().split(/\s+/);
      return { location: loc, isp };
    },
    async ipapi(ip) {
      const fields = 'status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query';
      const { data } = await util.request(`http://ip-api.com/json/${enc(ip)}?lang=zh-CN&fields=${fields}`);
      if (data.status !== 'success') throw util.makeError('parse');
      return {
        cc: data.countryCode,
        location: place(data.country, data.regionName, data.city),
        isp: data.isp,
        ...parseAS(data.as),
        flags: { hosting: !!data.hosting, proxy: !!data.proxy, mobile: !!data.mobile },
      };
    },
    async ipsb(ip) {
      const { data } = await util.request(`https://api.ip.sb/geoip/${enc(ip)}`);
      if (!data || !data.country_code) throw util.makeError('parse');
      return {
        cc: data.country_code,
        locationEn: place(data.country, data.region, data.city),
        isp: data.isp || data.organization,
        asn: data.asn || null,
        asnName: data.asn_organization || '',
      };
    },
    async ipwhois(ip) {
      const { data } = await util.request(`https://ipwho.is/${enc(ip)}`);
      if (!data || data.success === false) throw util.makeError('parse');
      const c = data.connection || {};
      return {
        cc: data.country_code,
        locationEn: place(data.country, data.region, data.city),
        isp: c.isp,
        asn: c.asn || null,
        asnName: c.org || '',
      };
    },
    async ipinfo(ip) {
      const { data } = await util.request(`https://ipinfo.io/${enc(ip)}/json`);
      if (!data || data.bogon) throw util.makeError('parse');
      return { cc: data.country, locationEn: place(data.country, data.region, data.city), ...parseAS(data.org) };
    },
  };

  const SOURCE_NAME = {
    zxinc: 'ZXInc', baidu: '百度', ipapi: 'ip-api', ipsb: 'IP.SB', ipwhois: 'ipwho.is', ipinfo: 'ipinfo',
  };

  /** 每个字段按优先级取第一个非空值 */
  const PRIORITY = {
    location: ['zxinc', 'baidu', 'ipapi'],
    locationEn: ['ipsb', 'ipwhois', 'ipinfo'],
    isp: ['zxinc', 'ipapi', 'baidu', 'ipsb', 'ipwhois'],
    cc: ['ipsb', 'ipapi', 'ipwhois', 'ipinfo'],
    asn: ['ipsb', 'ipapi', 'ipwhois', 'ipinfo'],
  };

  function pick(got, field) {
    for (const name of PRIORITY[field]) {
      const r = got[name];
      if (r && r[field] != null && r[field] !== '') return { value: r[field], from: name };
    }
    return null;
  }

  /** 纯函数：把各提供方的结果合并为 GeoInfo */
  function merge(ip, got) {
    const loc = pick(got, 'location') || pick(got, 'locationEn');
    const isp = pick(got, 'isp');
    const cc = pick(got, 'cc');
    const asn = pick(got, 'asn');
    const flags = got.ipapi && got.ipapi.flags;
    return {
      ip,
      cc: cc ? String(cc.value).toUpperCase() : '',
      location: loc ? loc.value : '',
      isp: isp ? isp.value : '',
      asn: asn ? asn.value : null,
      asnName: asn ? got[asn.from].asnName || '' : '',
      flags: flags || null,
      from: {
        location: loc ? SOURCE_NAME[loc.from] : '',
        asn: asn ? SOURCE_NAME[asn.from] : '',
        flags: flags ? SOURCE_NAME.ipapi : '',
      },
    };
  }

  async function doLookup(ip) {
    const got = {};
    const attempt = async (name) => {
      try {
        got[name] = await providers[name](ip);
      } catch (e) {
        got[name] = null;
      }
    };
    const first = ['zxinc', 'ipsb'];
    if (httpAllowed()) first.push('ipapi');
    await Promise.all(first.map(attempt));
    if (!pick(got, 'location')) await attempt('baidu');
    if (!pick(got, 'asn') || !pick(got, 'cc')) await attempt('ipwhois');
    if (!pick(got, 'asn') || !pick(got, 'cc')) await attempt('ipinfo');
    return merge(ip, got);
  }

  // 同时查询的 IP 数上限：一次性并发太多时 IP.SB 等接口会返回 429
  const MAX_CONCURRENT = 3;
  let active = 0;
  const waiting = [];

  function limited(task) {
    return new Promise((resolve) => {
      const go = () => {
        active++;
        task()
          .catch(() => null)
          .then((value) => {
            active--;
            if (waiting.length) waiting.shift()();
            resolve(value);
          });
      };
      if (active < MAX_CONCURRENT) go();
      else waiting.push(go);
    });
  }

  const cache = new Map();

  /** 查询 IP 归属地，同一 IP 只查一次（缓存 Promise，永不 reject） */
  function lookup(ip) {
    if (!cache.has(ip)) cache.set(ip, limited(() => doLookup(ip)).then((g) => g || merge(ip, {})));
    return cache.get(ip);
  }

  const COMPARE_ORDER = ['zxinc', 'baidu', 'ipapi', 'ipsb', 'ipwhois', 'ipinfo'];
  const compareCache = new Map();

  /** 多数据库对比：返回每个提供方各自的结果（页面为 https 时跳过仅支持 HTTP 的 ip-api） */
  function compare(ip) {
    if (!compareCache.has(ip)) {
      compareCache.set(ip, limited(() => Promise.all(COMPARE_ORDER.map(async (id) => {
        const base = { id, name: SOURCE_NAME[id] };
        if (id === 'ipapi' && !httpAllowed()) return { ...base, ok: false, error: 'https' };
        try {
          const r = await providers[id](ip);
          return { ...base, ok: true, ...r, location: r.location || r.locationEn || '' };
        } catch (e) {
          return { ...base, ok: false, error: typeof e.code === 'string' ? e.code : 'network' };
        }
      }))));
    }
    return compareCache.get(ip);
  }

  SafeIP.geo = { lookup, compare, merge, httpAllowed };
})(typeof window !== 'undefined' ? window : globalThis);

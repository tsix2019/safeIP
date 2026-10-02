/* SafeIP · china.js — isChinaUser：网站会不会把你识别为中国大陆用户（纯函数） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const CN_TZ = ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Kashgar', 'PRC'];

  const list = (ccs) => (ccs && ccs.length ? [...new Set(ccs)].map(util.countryName).join('、') : '无数据');

  /**
   * 根据采集到的数据生成信号。d 中任一字段为 null / undefined 表示尚未获得，对应信号 hit 为 null。
   * d: { timeZone, languages, fonts, intlExitCC, exitCCs, webrtcCCs, dnsCCs, google, baidu }
   */
  function signals(d) {
    const out = [];
    const sig = (key, label, hit, weight, detail, tip) => out.push({ key, label, hit, weight, detail, tip });
    const lang = d.languages && d.languages[0];
    const cnFonts = d.fonts ? d.fonts.filter((f) => (SafeIP.fp ? SafeIP.fp.CN_FONTS : []).includes(f)) : null;

    sig('intl', '国外网站看到的是中国 IP', d.intlExitCC ? d.intlExitCC === 'CN' : null, 35,
      `国外主出口：${d.intlExitCC ? util.countryName(d.intlExitCC) : '无数据'}`,
      '说明访问国外网站没有经过代理，或代理节点本身在中国。');
    sig('webrtc', 'WebRTC 暴露了中国 IP', d.webrtcCCs ? d.webrtcCCs.includes('CN') : null, 25,
      `STUN 看到的 IP 位于：${list(d.webrtcCCs)}`,
      '网页可借 WebRTC 拿到真实 IP。可让代理接管 UDP（TUN 模式），或在浏览器中限制 WebRTC。');
    sig('tz', '系统时区为中国', d.timeZone ? CN_TZ.includes(d.timeZone) : null, 25,
      `当前时区：${d.timeZone || '无数据'}`,
      '网页可直接读取时区。如需隐藏，可把系统时区改成出口所在地。');
    sig('gfw', 'Google 不可达而百度可达', d.google && d.baidu ? d.google === 'fail' && d.baidu === 'ok' : null, 20,
      `Google：${d.google === 'ok' ? '可达' : d.google === 'fail' ? '不可达' : '无数据'}，百度：${d.baidu === 'ok' ? '可达' : d.baidu === 'fail' ? '不可达' : '无数据'}`,
      '这是防火长城的典型特征。');
    sig('lang', '首选语言为简体中文', lang ? /^zh(-hans)?(-cn)?$/i.test(lang) || /^zh-hans-cn$/i.test(lang) : null, 10,
      `首选语言：${lang || '无数据'}`,
      '可在浏览器设置中调整语言顺序，但使用中文本身很常见。');
    sig('dns', 'DNS 由中国的服务器解析', d.dnsCCs ? d.dnsCCs.includes('CN') : null, 10,
      `解析服务器位于：${list(d.dnsCCs)}`,
      '可开启代理客户端的远程 DNS / fake-ip，让国外域名在代理端解析。');
    sig('cnexit', '存在中国大陆出口 IP', d.exitCCs ? d.exitCCs.includes('CN') : null, 10,
      `各出口位于：${list(d.exitCCs)}`,
      '国内网站看到中国 IP 是分流的正常结果，单独出现影响不大。');
    sig('fonts', '安装了简体中文字体', cnFonts ? cnFonts.length > 0 : null, 5,
      cnFonts && cnFonts.length ? cnFonts.join('、') : '未检测到',
      '中文系统一般自带，属于较弱的信号。');
    return out;
  }

  /** 汇总信号：返回 { score, level, verdict, complete } */
  function evaluate(sigs) {
    const score = Math.min(100, sigs.reduce((n, s) => n + (s.hit ? s.weight : 0), 0));
    const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
    const verdict = {
      high: '很可能被识别为中国大陆用户',
      medium: '可能被识别为中国大陆用户',
      low: '不太可能被识别为中国大陆用户',
    }[level];
    return { score, level, verdict, complete: sigs.every((s) => s.hit !== null) };
  }

  SafeIP.china = { CN_TZ, signals, evaluate };
})(typeof window !== 'undefined' ? window : globalThis);

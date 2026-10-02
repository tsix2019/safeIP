/* SafeIP · webrtc.js — 通过 STUN 获取 UDP 出口（检测 WebRTC 是否暴露真实 IP） */
(function (root) {
  'use strict';
  const SafeIP = (root.SafeIP = root.SafeIP || {});
  const { util } = SafeIP;

  const servers = [
    { id: 'miwifi', name: '小米', url: 'stun:stun.miwifi.com:3478', group: 'cn' },
    { id: 'bilibili', name: '哔哩哔哩', url: 'stun:stun.chat.bilibili.com:3478', group: 'cn' },
    { id: 'hitv', name: '芒果 TV', url: 'stun:stun.hitv.com:3478', group: 'cn' },
    { id: 'douyu', name: '斗鱼', url: 'stun:stun.douyucdn.cn:18000', group: 'cn' },
    { id: 'google', name: 'Google', url: 'stun:stun.l.google.com:19302', group: 'intl' },
    { id: 'cloudflare', name: 'Cloudflare', url: 'stun:stun.cloudflare.com:3478', group: 'intl' },
    { id: 'twilio', name: 'Twilio', url: 'stun:global.stun.twilio.com:3478', group: 'intl' },
  ];

  const supported = () => typeof root.RTCPeerConnection === 'function';

  /** 解析 ICE candidate 行：candidate:<f> <c> <proto> <prio> <addr> <port> typ <type> ... */
  function parseCandidate(line) {
    const parts = String(line || '').replace(/^a=/, '').trim().split(/\s+/);
    const typ = parts.indexOf('typ');
    if (parts.length < 8 || typ < 0) return null;
    return { protocol: (parts[2] || '').toLowerCase(), address: parts[4], port: Number(parts[5]), type: parts[typ + 1] };
  }

  /** 用单个 STUN 服务器收集候选地址，永不抛错 */
  function probe(server, { timeout = 5000 } = {}) {
    if (!supported()) {
      return Promise.resolve({ id: server.id, ok: false, publicIPs: [], hostCandidates: [], error: 'unsupported' });
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const publicIPs = new Set();
      const hosts = new Set();
      let firstMs = null;
      let pc = null;
      let done = false;

      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { if (pc) pc.close(); } catch (e) { /* 已关闭 */ }
        const ips = [...publicIPs];
        resolve({
          id: server.id, ok: ips.length > 0, publicIPs: ips, hostCandidates: [...hosts], ms: firstMs,
          error: ips.length ? undefined : error || 'nocandidate',
        });
      };
      const timer = setTimeout(() => finish('timeout'), timeout);

      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: server.url }] });
        pc.createDataChannel('safeip');
        pc.onicecandidate = (e) => {
          if (!e.candidate) return finish(); // 收集完成
          const c = parseCandidate(e.candidate.candidate);
          if (!c) return;
          if (c.type === 'srflx' && util.isPublicIP(c.address)) {
            if (firstMs === null) firstMs = Math.round(performance.now() - t0);
            publicIPs.add(c.address);
          } else if (c.type === 'host' && c.address) {
            hosts.add(c.address);
          }
        };
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') finish();
        };
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .catch(() => finish('error'));
      } catch (e) {
        finish('error');
      }
    });
  }

  SafeIP.webrtc = { servers, supported, parseCandidate, probe };
})(typeof window !== 'undefined' ? window : globalThis);

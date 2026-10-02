// 测试夹具：结构取自各接口的真实响应，IP / ASN 全部替换为文档专用地址（RFC 5737 / RFC 3849 / RFC 5398）
const CN_IP = '198.51.100.23'; // 示例：国内出口
const INTL_IP = '203.0.113.7'; // 示例：海外出口
const V6_IP = '2001:db8:1::7';
const RESOLVER = '192.0.2.53';
const RESOLVER6 = '2001:db8:53::1';

const responses = {
  ipip: { ret: 'ok', data: { ip: CN_IP, location: ['中国', '上海', '上海', '', '电信'] } },
  ipipForeign: { ret: 'ok', data: { ip: INTL_IP, location: ['美国', '加利福尼亚州', '洛杉矶', 'example.net', ''] } },
  upyun: {
    addr: '192.0.2.10', server: 'marco/3.2.5', remote_addr: INTL_IP,
    addr_location: { country: '中国', isp: '移动', province: '江苏', continent: '亚洲', city: '南京' },
    remote_addr_location: { country: '美国', isp: '', province: '加利福尼亚州', continent: '北美洲', city: '洛杉矶' },
  },
  dnspod: `${INTL_IP}\n`,
  netease: {
    message: '查询成功', status: 200,
    result: { city: '洛杉矶', company: 'Example Net', country: '美国', countrySymbol: 'US', ip: INTL_IP, operator: '', province: '加利福尼亚州' },
  },
  pconline: { ip: CN_IP, pro: '上海市', proCode: '310000', city: '上海市', addr: '上海市 电信', err: '' },
  pconlineForeign: { ip: INTL_IP, pro: '', proCode: '999999', city: '', addr: ' 美国', err: 'noprovince' },
  qqvideo: { s: 'o', t: 1790000000, ip: CN_IP, pos: '---', rand: 'abc' },
  zxinc: {
    code: 0,
    data: {
      myip: INTL_IP, ip: { query: INTL_IP, start: '', end: '' },
      location: '美国–加利福尼亚州–洛杉矶 Example Net', country: '美国–加利福尼亚州–洛杉矶', local: 'Example Net',
    },
  },
  trace: [
    'fl=1f1', 'h=chatgpt.com', `ip=${INTL_IP}`, 'ts=1790000000.000', 'visit_scheme=https',
    'uag=Mozilla/5.0', 'colo=LAX', 'sliver=none', 'http=http/2', 'loc=US', 'tls=TLSv1.3',
    'sni=plaintext', 'warp=off', 'gateway=off', 'rbi=off', 'kex=X25519', '',
  ].join('\n'),
  ipsb: {
    region: 'California', organization: 'Example Net', region_code: 'CA', isp: 'Example Net',
    city: 'Los Angeles', asn_organization: 'Example Net LLC', asn: 64500, ip: INTL_IP,
    country: 'United States', country_code: 'US',
  },
  ipinfo: { ip: INTL_IP, city: 'Los Angeles', region: 'California', country: 'US', org: 'AS64500 Example Net LLC' },
  ipwhois: {
    ip: INTL_IP, success: true, type: 'IPv4', country: 'United States', country_code: 'US',
    region: 'California', city: 'Los Angeles',
    connection: { asn: 64500, org: 'Example Net LLC', isp: 'Example Net', domain: 'example.net' },
  },
  identme: { ip: INTL_IP, aso: 'Example Net LLC', asn: 64500, type: 'hosting', cc: 'US', country: 'United States', city: 'Los Angeles' },
  ipleak: {
    as_number: 64500, isp_name: 'Example Net LLC', country_code: 'US', country_name: 'United States',
    region_name: 'California', city_name: 'Los Angeles', ip: INTL_IP, query_type: 'myip',
  },
  ipsb6: { ip: V6_IP, country_code: 'US', country: 'United States', city: 'Los Angeles', isp: 'Example Net', asn: 64500 },
};

module.exports = { CN_IP, INTL_IP, V6_IP, RESOLVER, RESOLVER6, responses };

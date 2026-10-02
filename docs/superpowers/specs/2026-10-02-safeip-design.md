# SafeIP · 全球 IP 分流检测工具 — 设计文档

- 日期：2026-10-02
- 状态：设计已确认，待实现

## 1. 背景与目标

用户开启了代理分流（不同域名 / 流量走不同出口）。需要一个网页工具，从**国内服务、国外服务、具体网站**多个视角同时检测"对方看到的我的 IP"，并附带 WebRTC 泄露、DNS 泄露、网站连通性与 IP 属性判断，一眼看清：

- 一共有几个出口 IP，各自在哪、属于哪个运营商、是机房还是宽带；
- 哪些服务走了哪个出口，有没有"规则没覆盖到"的例外；
- 真实 IP 会不会通过 WebRTC（UDP）或 DNS 泄露。

### 1.1 典型场景（作为验收用例）

开发时在一台"国内宽带 + 规则分流代理"的机器上实测（curl + Node UDP STUN），得到如下典型结果：

| 视角 | 看到的出口 |
|---|---|
| 少数被规则直连的服务（如腾讯视频、npm） | **国内出口**：本地运营商宽带 IP |
| 其余国内服务与全部国外服务、AI 站点 | **海外出口**：代理节点 IP |
| 全部 STUN 服务器（含 Google / Cloudflare / Twilio） | **国内出口**（UDP 未经代理） |
| DNS 解析服务器 | 本地运营商 DNS（IPv4 + IPv6） |
| IPv6 | 无 IPv6 连通性 |

即：TCP 按规则分流，UDP 全部直连，DNS 走本地运营商。工具应判定"已分流 + WebRTC 泄露 + DNS 泄露风险"。

## 2. 方案选择

采用**纯前端静态页**：所有检测请求由浏览器直接发出，天然经过用户的代理 / 分流规则（系统代理、TUN、路由器均可），结果即真实上网情况。双击 `index.html` 即可使用，也可部署到任意静态托管。

否决的方案：

- 前端 + 本地后端：后端进程的流量不走浏览器的代理设置，测得的出口与浏览器不一致，会误导分流判断；
- 浏览器扩展：需安装、仅 Chromium 系、开发成本高。

约束：只能使用支持 CORS 或 JSONP 的数据源（第 4 节清单均已实测可用）。

## 3. 架构

> 本节为 v1 结构；v2 起改为多页面工具箱，新增的路由、页面与模块见第 10 节。

```
safeIP/
├── index.html            页面骨架（各区块容器）
├── css/style.css         样式；明暗主题跟随系统
├── js/
│   ├── util.js           网络与通用工具
│   ├── sources.js        IP 检测源清单 + 执行
│   ├── geo.js            IP 归属地 / 属性查询（多源合并 + 缓存）
│   ├── webrtc.js         STUN 检测
│   ├── dns.js            DNS 泄露检测
│   ├── connectivity.js   网站连通性与延迟
│   ├── analyze.js        纯逻辑：出口分组、结论、泄露判定、IP 类型、文本报告
│   └── app.js            调度与渲染（唯一操作页面 DOM 的模块）
└── tests/                node --test 单元测试（解析器 + analyze）
```

- 使用经典 `<script>`（非 ES Module）：Chrome 禁止 `file://` 页面加载模块脚本，经典脚本才能保证双击可用。
- 脚本全部写成 `<script defer fetchpriority="high">` 放在 `<head>`：CSP `<meta>` 会让 Chrome 的预加载扫描器失效，放在 `<body>` 末尾的普通脚本会逐个串行下载（实测 GitHub Pages 上主体空白约 15 秒）；改为 defer 后并行下载，约 1 秒出现主体。第一个脚本放在样式表之前：部分安全软件会在第一个 `<script>` 前插入同步脚本，插在样式表之后时它要等样式表下载完，会推迟所有脚本的下载。`tests/html.test.js` 防止回退。
- SEO：`index.html` 带 canonical、Open Graph / Twitter 卡片、JSON-LD（WebApplication）和图标文件（`assets/`）；`#view` 里的启动页写有 h1 与介绍，不执行 JS 的爬虫也能读到页面主题。`#view` 至少一屏高、出口卡片先显示骨架、首页副标题检测中也有文字，避免结果陆续出现时的布局偏移。
- 先画页面再检测：`app.js` 挂载页面后等下一帧绘制完成再启动检测（创建 WebRTC 连接在刚启动的浏览器里可能占用主线程一两秒）；浏览器指纹在主线程空闲时采集。
- 所有模块挂到全局命名空间 `SafeIP`（浏览器为 `window.SafeIP`，Node 测试中为 `globalThis.SafeIP`）。模块加载时不触碰 DOM，因此可在 Node 中直接 `require` 做单测。
- 零依赖、无构建步骤。

### 3.1 模块接口

**util.js — `SafeIP.util`**

- `request(url, { as: 'json' | 'text', timeout = 8000 })` → `{ data, ms }`；固定 `cache: 'no-store'`、`credentials: 'omit'`。失败抛出带 `code` 的 Error：`timeout | network | http | parse`。
- `jsonp(url, { timeout })` → `{ data, ms }`：`url` 中的 `{cb}` 替换为唯一回调名；结束后清理 script 标签与全局回调。
- `scriptVar(url, varName, { timeout })` → `{ data, ms }`：注入脚本后读取 `window[varName]`；同名变量的请求串行执行，读完即删除。
- `ipFamily(s)` → `'v4' | 'v6' | null`；`isPublicIP(ip)`：排除私有、回环、链路本地、CGNAT（100.64/10）、ULA（fc00::/7）等。
- `parseTrace(text)` → `{ ip, loc, colo, warp, gateway, … }`（Cloudflare `/cdn-cgi/trace` 的 `k=v` 行）。
- `maskIP(ip)`：`198.51.100.23 → 198.51.*.*`；IPv6 只保留前两段。
- `flag(cc)`：国家代码 → 旗帜 emoji。
- `randomLabel(n)`：长度为 n 的随机小写字母数字串（DNS 检测用）。

**sources.js — `SafeIP.sources`**

- `list`：检测源描述数组：
  ```js
  { id, name, host, group: 'cn' | 'intl' | 'site' | 'v6',
    method: 'json' | 'text' | 'jsonp' | 'scriptvar',
    url, varName /* 仅 scriptvar */,
    parse(data) /* → { ip, location?, isp?, cc?, extra? } */ }
  ```
- `run(source)` → `{ id, ok, ip, family, location, isp, cc, extra, ms, error }`。`parse` 返回的 `ip` 必须通过 `ipFamily` 校验，否则按 `parse` 错误处理。

**geo.js — `SafeIP.geo`**

- `lookup(ip)` → `GeoInfo`，同一 IP 只查一次（缓存 Promise）：
  ```js
  { ip, cc, location /* 中文优先，如 "中国 上海" */, isp, asn, asnName,
    flags: { hosting, proxy, mobile } /* 仅 ip-api 可用时存在 */,
    from: { location, asn, flags } /* 各字段的数据来源 */ }
  ```

**webrtc.js — `SafeIP.webrtc`**

- `servers`：STUN 列表（见 4.6）。
- `probe(server, { timeout = 5000 })` → `{ id, ok, publicIPs: [], hostCandidates: [], ms, error }`。

**dns.js — `SafeIP.dns`**

- `run()` → `{ resolvers: [{ ip, via: ['ip-api' | 'ipleak'], hint }], ecs: { ip, hint } | null, errors: [] }`。

**connectivity.js — `SafeIP.connectivity`**

- `sites`：站点列表（见 4.8）；`probe(site)` → `{ id, ok, first, reuse, error }`（毫秒）。

**analyze.js — `SafeIP.analyze`**（纯函数，无 I/O、无 DOM）

- `exits(results)`、`routing(results)`、`classifyIP(geoInfo, identType)`、`webrtcVerdict(rtcResults, routing)`、`dnsVerdict(resolvers, routing, geoMap)`、`aiRegionWarning(siteId, cc)`、`report(state)`。

## 4. 数据源（2026-10-02 全部实测）

### 4.1 国内服务（group `cn`）

| id | 名称 | 请求 | 方式 | 解析 |
|---|---|---|---|---|
| ipip | IPIP.net | `https://myip.ipip.net/json` | json（CORS） | `data.ip`；地点 `data.location[0..2]`；运营商 `location[4] \|\| location[3]` |
| upyun | 又拍云 | `https://pubstatic.b0.upaiyun.com/?_upnode` | json（CORS） | `remote_addr`；`remote_addr_location.{country,province,city,isp}` |
| dnspod | DNSPod | `https://ipv4.ddnspod.com` | text（CORS） | 全文即 IP |
| netease | 网易 | `https://ipservice.ws.126.net/locate/api/getLocByIp?callback={cb}` | jsonp | `result.ip`；`result.{country,province,city}`；`result.company` |
| pconline | 太平洋电脑网 | `https://whois.pconline.com.cn/ipJson.jsp?callback={cb}` | jsonp（GBK） | `ip`；`addr`（去首尾空格） |
| qqvideo | 腾讯视频 | `https://vv.video.qq.com/checktime?otype=json` | scriptvar `QZOutputJson` | `ip` |
| zxinc | zxinc | `https://ip.zxinc.org/api.php?type=json` | json（CORS） | `data.myip`；地点 `data.country`（`–` 换成空格）；运营商 `data.local` |

### 4.2 国外服务（group `intl`）

| id | 名称 | 请求 | 方式 | 解析 |
|---|---|---|---|---|
| cloudflare | Cloudflare | `https://www.cloudflare.com/cdn-cgi/trace` | text | `parseTrace` → ip、loc、colo |
| ipify | ipify | `https://api4.ipify.org?format=json` | json | `ip` |
| ipsb | IP.SB | `https://api.ip.sb/geoip` | json | `ip`、`country_code`、`city`、`isp`、`asn` |
| ipinfo | ipinfo | `https://ipinfo.io/json` | json | `ip`、`country`、`city`、`org` |
| ipwhois | ipwho.is | `https://ipwho.is/` | json | `ip`、`country_code`、`city`、`connection.isp` |
| identme | ident.me | `https://v4.ident.me/json` | json | `ip`、`cc`、`city`、`aso`、`type`（IP 类型） |
| ipleak | ipleak.net | `https://ipleak.net/json/` | json | `ip`、`country_code`、`city_name`、`isp_name` |

### 4.3 网站视角（group `site`）

Cloudflare 托管站点的 `/cdn-cgi/trace` 均返回 `Access-Control-Allow-Origin: *`，可直接读取"该网站看到的 IP 与国家"：

ChatGPT `chatgpt.com`、OpenAI `openai.com`、Claude `claude.ai`、Grok `grok.com`、X `x.com`、Notion `www.notion.so`、npm `www.npmjs.com`。

统一请求 `https://<host>/cdn-cgi/trace`，展示 IP、网站判定的国家（`loc`）、Cloudflare 节点（`colo`）、WARP 状态（`warp`）。ChatGPT / OpenAI / Claude / Grok 的 `loc` 属于 {CN, HK, MO, RU, BY, IR, KP, SY, CU} 时，标注"该地区可能不受支持"。

### 4.4 IPv6（group `v6`）

`https://api6.ipify.org?format=json`、`https://api-ipv6.ip.sb/geoip`、`https://v6.ident.me/json`、`https://ipv6.icanhazip.com`（text）、`https://ipv6.ddnspod.com`（text，国内）。解析方式与对应 IPv4 源相同。

全部失败时整组显示"未检测到 IPv6 出口"，属正常结果，不显示为错误。

### 4.5 归属地 / 属性查询（geo.js）

| 提供方 | 请求 | 方式 | 提供 |
|---|---|---|---|
| zxinc | `https://ip.zxinc.org/api.php?type=json&ip=<ip>` | json（CORS） | 中文地点、运营商 |
| 百度 | `https://opendata.baidu.com/api.php?query=<ip>&resource_id=6006&oe=utf8&format=json&cb={cb}` | jsonp | 中文地点 + 运营商（国内 IP 精确） |
| ip-api | `http://ip-api.com/json/<ip>?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query` | json（仅 HTTP） | 中文地点、ISP、AS、**hosting / proxy / mobile 标记** |
| IP.SB | `https://api.ip.sb/geoip/<ip>` | json | 国家代码、ASN、ASN 组织、ISP |
| ipwho.is | `https://ipwho.is/<ip>` | json | 国家代码、ASN、ISP（备用） |
| ipinfo | `https://ipinfo.io/<ip>/json` | json | 国家代码、`org`（"AS123 名称"，备用） |

策略：

1. 第一轮并发 zxinc + IP.SB + ip-api（页面为 `https:` 时跳过 ip-api，混合内容会被浏览器拦截）。
2. 仍缺中文地点 → 查百度；仍缺 ASN 或国家代码 → 依次查 ipwho.is、ipinfo。
3. 每个字段按"zxinc → 百度 → ip-api → IP.SB → ipwho.is → ipinfo"顺序取第一个非空值（ASN 类字段优先 IP.SB），并记录来源。

### 4.6 WebRTC STUN 服务器（UDP 实测可达）

- 国内：小米 `stun.miwifi.com:3478`、B 站 `stun.chat.bilibili.com:3478`、芒果 TV `stun.hitv.com:3478`、斗鱼 `stun.douyucdn.cn:18000`
- 国外：Google `stun.l.google.com:19302`、Cloudflare `stun.cloudflare.com:3478`、Twilio `global.stun.twilio.com:3478`

每个服务器单独一个 `RTCPeerConnection`（只配这一个 iceServer），创建 DataChannel 与 offer，收集 `typ srflx` 候选（该 STUN 看到的公网 IP）和 `typ host` 候选（Chrome 通常为 mDNS `.local` 名，显示为"已被浏览器隐藏"）。ICE 收集完成或超时即结束并 `close()`。

### 4.7 DNS 泄露

- ip-api EDNS：并发 3 次 `https://<32 位随机>.edns.ip-api.com/json` → `dns.ip`、`dns.geo`；若响应含 `edns` 字段，显示 ECS 子网信息。
- ipleak：并发 2 次 `https://<40 位随机>.ipleak.net/dnsdetection/` → `ip` 对象的键即解析服务器 IP。
- 合并去重后，对每个解析服务器 IP 做归属地查询。

### 4.8 网站连通性

- 国内：百度、淘宝、B 站、微信、京东、网易云音乐
- 国外：Google、YouTube、GitHub、ChatGPT、Claude、X、Wikipedia、Telegram、Instagram、Cloudflare
- 方法：`fetch('https://<host>/favicon.ico?_=<时间戳>', { mode: 'no-cors', cache: 'no-store' })`，收到任何 HTTP 响应即算可达。同一站点连测两次：第一次为"首连"（含 DNS / TCP / TLS），第二次为"复用"（近似往返延迟）。并发 4，超时 8s。
- 分级：< 150ms 快、< 400ms 一般、≥ 400ms 慢、失败。

## 5. 结论逻辑（analyze.js）

1. **出口分组**：所有成功结果按 IP 分组，每组记录看到它的服务及各分组计数，按出现次数降序。IPv4 与 IPv6 分开统计。每个出口分配一个颜色序号，用于出口卡片与明细行的对照标记。
2. **分流判定**（IPv4）：
   - 0 个出口 → "检测失败（网络不可用？）"
   - 1 个出口 → "单一出口：所有服务看到同一 IP（未开代理 / 全局代理）"
   - ≥ 2 个出口 → "已分流：检测到 N 个出口"
   - 国内主出口 = `cn` 组中出现最多的 IP；国外主出口 = `intl` + `site` 组中出现最多的 IP；平票时取清单中靠前的服务所见 IP。
   - **例外** = 与本组主出口不同的服务，例如"腾讯视频（国内）走了 CN 出口，其余国内服务走 AU 出口"，并提示"可能是分流规则未覆盖该域名"。
   - 存在多个出口但国内、国外主出口相同时，额外提示"大部分流量走同一出口，仅少数域名被分流"。
3. **WebRTC 判定**：
   - 不支持 `RTCPeerConnection`，或所有 STUN 都没拿到公网候选 → "未获取到 WebRTC 公网地址（WebRTC 被禁用或 UDP 不通），网站无法借此获取你的 IP"。
   - 任一 STUN 看到的 IPv4 公网 IP ≠ 国外主出口，或 IPv6 公网 IP 不在 HTTP 检测到的 IPv6 出口中 → **泄露**，列出泄露 IP；若它等于国内主出口，注明"与国内出口相同，通常就是你的真实 IP"。
   - 否则 → 安全（UDP 与国外出口一致）。
4. **DNS 判定**：
   - 无解析服务器数据 → 未知。
   - 任一解析服务器所在国家 ≠ 国外主出口所在国家 → **存在泄露风险**："访问国外网站时，DNS 由 <国家 运营商> 解析"。
   - 否则 → 未发现泄露。
5. **IP 类型**（`classifyIP`，按优先级）：ip-api `proxy` → 代理 / VPN；`hosting` → 机房 / IDC；`mobile` → 移动网络；ident.me `type`（hosting / isp / business / education 等）；ASN / ISP 名称关键词（云厂商、IDC 关键词 → "机房（推测）"；运营商关键词 → "宽带（推测）"）；否则"未知"。
6. **文本报告**：概览结论 + 出口列表 + 各服务结果 + WebRTC / DNS 结论 + 连通性摘要，供"复制报告"使用（隐藏 IP 开启时报告中的 IP 同样打码）。

## 6. 页面与交互

自上而下：

1. **顶栏**：标题"SafeIP · 全球 IP 分流检测"；按钮"重新检测"、"复制报告"；开关"隐藏 IP"（截图分享用，全页 IP 打码）。
2. **出口概览**：结论横幅（颜色区分状态）+ 每个出口一张卡片（旗帜、IP、地点、运营商 / ASN、类型、看到它的服务）+ 风险提示（WebRTC / DNS / 例外）。
3. **IP 检测详情**：四个分组表格（国内 / 国外 / 网站视角 / IPv6），列：服务（名称 + 域名）、IP、地点、运营商 / ASN、耗时、状态。行首色点与出口卡片颜色对应。
4. **WebRTC 检测**：每个 STUN 服务器一行（服务器、公网 IP、地点、耗时）；下方列出 host 候选。
5. **DNS 泄露检测**：解析服务器 IP、地点、运营商、来源；结论。
6. **网站连通性**：站点卡片网格，显示首连 / 复用延迟与颜色分级。
7. **页脚**：说明"所有请求均由你的浏览器直接发往对应第三方服务，本工具没有后端"。

其他：打开页面即自动开始检测；结果逐行渐进填充；明暗主题跟随系统；窄屏下表格改为卡片堆叠。

## 7. 错误处理

- 每个请求独立超时：HTTP / JSONP 8s、STUN 5s。使用 `Promise.allSettled`，任何单点失败只影响自身行，显示"超时 / 无法连接 / 响应异常"。
- 解析出的 IP 不合法 → "响应异常"。
- 页面为 `https:` 时跳过 HTTP-only 的 ip-api，并在 IP 类型处注明"HTTPS 下部分属性数据不可用"。
- 归属地查询全部失败时仍显示 IP，地点显示"—"。
- 浏览器不支持 WebRTC 时显示对应提示；剪贴板 API 不可用时退回 `document.execCommand('copy')`。

## 8. 测试与验收

**单元测试**（`node --test tests/`）：

- `util`：`ipFamily`、`isPublicIP`、`parseTrace`、`maskIP`、`flag`。
- `sources`：每个检测源的 `parse`，以实测抓取的真实响应为夹具（其中真实 IP 替换为 RFC 5737 / RFC 3849 文档地址）。
- `analyze`：单一出口 / 分流 / 例外识别；WebRTC 泄露 / 安全 / 不可用；DNS 泄露 / 安全 / 未知；`classifyIP` 各分支；AI 地区提示；报告打码。

**实机验收**（内置浏览器，分别以 `http://localhost` 与 `file://` 打开），以 1.1 节环境为准：

1. 所有区块均出结果，控制台无未捕获异常。
2. 概览判定"已分流"，出现国内出口与海外出口两张卡片，并列出例外服务。
3. WebRTC 区判定泄露（STUN 看到国内出口，与国外主出口不同）。
4. DNS 区列出本地运营商的解析服务器，判定存在泄露风险。
5. 连通性区国内站点可达，国外站点按实际情况显示。
6. "隐藏 IP"开关全页生效；"复制报告"可粘贴出完整文本。

## 9. 不做（YAGNI）

后端服务、历史记录、流媒体解锁检测、测速、自定义数据源、多语言。

## 10. v2 扩展：多功能工具箱（2026-10-02 确认）

用户希望对标同类产品补齐功能（不含"AI 资讯"）。约束不变：纯前端、零依赖、经典脚本、双击可用。

### 10.1 页面结构

- 改为标签页式单页应用：`#/页面?参数` 哈希路由，`file://` 下同样可用。
- 顶栏第一行：品牌、主题切换（跟随系统 / 浅色 / 深色，存 localStorage）、隐藏 IP、复制报告、重新检测；第二行：可横向滚动的标签导航，末尾"更多"下拉。
- 打开页面即在后台运行核心检测（多源 IP、WebRTC、DNS、连通性），各页面订阅核心状态变化重绘；其余检测（Whois、全球 Ping、服务状态等）在打开对应页面或点击按钮时才运行。

| 路由 | 页面 | 内容 |
|---|---|---|
| `#/` | 首页 | 结论 + 六张体检卡（分流、WebRTC、DNS、AI 地区、IP 评分、isChinaUser）+ 出口卡片 + 例外提示 |
| `#/lookup` | IP 查询 | 输入 IP / 域名（域名经 Google DoH 解析）；多数据库归属地对比、ASN、类型、评分摘要、RDAP 网段 |
| `#/split` | 分流测试 | v1 的多源 IP 检测 + 约 30 个 Cloudflare 站点出口测试（按 AI / 开发 / 内容 / 其他分类）+ 自定义域名 |
| `#/ai` | AI 检测 | ChatGPT、OpenAI API、Claude、Anthropic API 等看到的 IP、判定国家、节点、地区是否支持、出口 IP 类型与评分、官方服务状态 |
| `#/risk` | IP 评分 | 各出口 IP 的 0–100 风险分与逐项依据 |
| `#/conn` | 网络连通 | v1 连通性 + "再测一次" |
| `#/dns` | DNS 泄露 | v1 |
| `#/webrtc` | WebRTC | v1 |
| `#/cloudflare` | Cloudflare | trace 全字段（含中文说明）、节点代码 → 城市、WARP / Gateway、Cloudflare 服务状态 |
| `#/ping` | 全球 Ping | check-host.net 全球节点 ping（失败时回退 Globalping），目标默认为出口 IP，可自定义 |
| `#/fingerprint` | 浏览器指纹 | UA / UA-CH、语言、时区、屏幕、硬件、Canvas / WebGL / 音频哈希、字体；时区、语言与出口所在地一致性检查 |
| `#/china` | isChinaUser | 汇总时区、语言、中文字体、国内出口、WebRTC / DNS 所在地、Google 与百度可达性，给出被识别为中国大陆用户的可能性 |
| `#/status` | 服务状态 | OpenAI、Claude、GitHub、Cloudflare、Discord（Statuspage 接口）与 Google Cloud（incidents.json） |
| `#/whois` | Whois | 域名 / IP 的 RDAP 查询（rdap.org，域名回退 IANA 引导表） |
| `#/asn` | ASN | RIPEstat as-overview / announced-prefixes、PeeringDB 网络资料、RDAP autnum |
| `#/card` | IP 卡片 | Canvas 绘制 1200×630 PNG（出口、归属地、体检结论，可打码），预览并下载 |

### 10.2 新增模块

- `core.js`：从 v1 `app.js` 抽出的核心检测状态与调度（`start / on / view / fmt / geoOf / typeOf`）。
- `ui.js`：公共组件（转义、图标、状态图标、卡片、提示条、复制、Toast）。
- `router.js`：哈希路由、导航渲染与高亮、页面挂载与订阅。
- `risk.js`：信号采集与打分。信号：ip-api 代理 / 机房 / 移动标记、ident.me 类型、PeeringDB 网络类型、RIPEstat RIR 注册国（原生 / 广播 IP）、7 个 DNSBL（经 dns.google 查询：SpamCop、DroneBL、UCEPROTECT L1、PSBL、Mailspike、s5h、dan.me.uk Tor）、Onionoo Tor 节点、StopForumSpam。`score(signals)` 为纯函数：代理 +40、Tor 出口 +50（中继 +10）、机房 +25、广播 IP +10、每个黑名单 +15（上限 45）、StopForumSpam 出现 +15～30；封顶 100；<20 低、<50 中、<75 高、≥75 极高。
- `whois.js`：RDAP 查询与解析（域名、网段、ASN；vCard 实体解析）、ASN 资料聚合。
- `gping.js`：check-host.net 发起与轮询、结果归一化；Globalping 回退。
- `svcstatus.js`：Statuspage summary 与 Google Cloud incidents 归一化。
- `fingerprint.js`：指纹采集、非加密哈希（cyrb53，避免依赖安全上下文）、一致性检查。
- `china.js`：isChinaUser 信号与打分（纯函数）。
- `splittest.js`：Cloudflare 站点清单、trace 测试、域名输入规范化。
- `ipcard.js`：Canvas 卡片绘制。
- 页面：`js/pages/*.js`，每个页面 `{ mount(el, params), update() }`。

### 10.3 实测结论（2026-10-02）

- 可用：RIPEstat、PeeringDB、RDAP（rdap.org、Verisign、ARIN、APNIC、RIPE）、IANA 引导表、dns.google DoH、各 DNSBL、Onionoo、StopForumSpam、check-host.net、OpenAI / Claude / GitHub / Cloudflare / Discord 状态页、Google Cloud incidents。
- 不可用或受限：Globalping 与 cloudflare-dns.com 在部分网络被干扰（作回退）；Spamhaus 拒绝公共解析器查询（不采用）；`.cn`、`.io` 等后缀无公开 RDAP；Instagram、Discord 等站点禁止跨站读取（不用于连通性 / 分流测试）。

### 10.4 v1 实现中的调整

- 国旗 emoji 在 Windows 上不显示，改为国家代码徽标；`util.flag` 改为 `util.countryName`（`Intl.DisplayNames`）与 `util.place / clean`。
- 检测源超时放宽到 12s；归属地查询限制 3 个并发（避免 IP.SB 429）。
- 连通性每站测 1 + 3 次取中位数，不加防缓存参数（部分站点会把带参数的请求重定向到 http）；Claude 改测 `/cdn-cgi/trace`，Instagram 换成 Facebook（ORB / CORP 拦截）。

## 11. 已知限制

- 第三方源可能变更或限流；单源失败不影响整体，后续可在 `sources.js` 中增删。
- 各归属地数据库之间存在差异，地点 / 类型仅供参考（推测结果明确标注）。
- DNS 泄露按"解析服务器国家 ≠ 国外出口国家"判断；使用 Anycast 公共 DNS 时可能误判，结论措辞为"风险"。
- 连通性延迟基于 HTTP 请求计时，含服务器处理时间，不等同于 ping。
- 浏览器扩展（广告拦截、WebRTC 防护插件等）可能拦截部分请求，表现为该行失败。

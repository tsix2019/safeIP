<div align="center">

# SafeIP · Split-Routing IP Checker

**An all-in-one IP toolbox: multi-source IP checks from China and abroad, split-routing tests, AI service regions, IP risk score, WebRTC / DNS leak tests, global ping, browser fingerprint and Whois**

[简体中文](README.md) | English

**[Try it online →](https://tsix2019.github.io/safeIP/)**

</div>

![Home](docs/images/home.png)

> All IPs and ISPs in the screenshots are sample data (RFC 5737 documentation addresses), not real results.

> The interface is in Simplified Chinese.

## Why

Once you use a rule-based proxy (Clash / Mihomo, Surge, sing-box, v2rayN, …), the questions that matter are:

- Which IP do Chinese sites see, and which IP do foreign sites see? Did your rules miss any domains?
- Which country do ChatGPT and Claude think you are in? Will your region or IP quality get you blocked?
- Does your real IP leak through WebRTC (UDP) or DNS?
- Will websites identify you as a mainland-China user?

A typical "what is my IP" site only shows the one IP it sees. SafeIP checks from the perspective of dozens of services and websites inside and outside China at the same time, groups the results by exit, and gives you a verdict.

## Highlights

- **Pure front end, zero dependencies, no backend**: every request is sent by your own browser, so it follows your proxy rules and shows exactly what happens when you browse
- **Just open it**: download and double-click `index.html`, or host it on any static host
- **Verdicts first**: six check cards on the home page — routing, WebRTC, DNS, AI region, IP score and isChinaUser
- **Visual split routing**: each exit has its own color, so you can see at a glance which exit every check went through
- **Privacy friendly**: mask all IPs with one switch before taking screenshots; copied text reports are masked too

## Features

| Page | What it does |
|---|---|
| Home | Exit overview, six check cards, exit cards (location / ISP / ASN / type / score), routing exceptions |
| IP lookup | Look up any IP or domain: location from several databases side by side, ASN, IP type, risk score, RDAP network |
| Split test | 7 Chinese services, 7 international services, 7 website traces and IPv6; plus exit tests for ~30 popular sites (AI / dev / social / tools) and custom domains |
| AI check | IP, detected country, edge node, region support and official status for Claude, ChatGPT (web and API), Grok, Perplexity, Poe and Character.AI |
| IP score | Proxy / hosting flags, network type, native vs. broadcast IP, Tor, StopForumSpam and 7 DNS blocklists, combined into a transparent 0–100 score |
| Connectivity | Reachability and latency of 16 popular sites (cold request + median of 3 warm requests) |
| DNS leak | Which DNS resolvers actually resolve names for you, and where they are |
| WebRTC | UDP exit seen by 7 STUN servers in and outside China — does your real IP leak? |
| Cloudflare | Every trace field explained: edge city, HTTP / TLS version, WARP, Zero Trust, plus Cloudflare status |
| Global ping | Ping your exit or any address from ~40 nodes worldwide |
| Fingerprint | UA / UA-CH, languages, time zone, screen, hardware, Canvas / WebGL / audio hashes, fonts; checks whether time zone and language match your exit country |
| isChinaUser | Combines 8 signals to estimate whether sites will treat you as a mainland-China user |
| Service status | Official status of OpenAI, Claude, GitHub, Cloudflare, Discord and Google Cloud |
| Whois | RDAP registration data for domains and IPs (subdomains are reduced to the registrable domain) |
| ASN | ASN holder, PeeringDB network type, announced IPv4 / IPv6 prefixes |
| IP card | Generates a 1200×630 image to share |

<table>
  <tr>
    <td width="50%"><img src="docs/images/split.png" alt="Split test"><p align="center">Split test</p></td>
    <td width="50%"><img src="docs/images/ai-dark.png" alt="AI check (dark theme)"><p align="center">AI check (dark theme)</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/risk.png" alt="IP score"><p align="center">IP score</p></td>
    <td width="50%"><img src="docs/images/card.png" alt="IP card"><p align="center">IP card</p></td>
  </tr>
</table>

## Getting started

**Online**

Open https://tsix2019.github.io/safeIP/ . The online version is served over HTTPS, so the HTTP-only ip-api is unavailable (proxy / hosting flags have one source fewer). For full data, download the repository and open it locally.

**Option 1: open the file**

Download the repository (or `git clone` it) and double-click `index.html`. Use a recent Chrome, Edge or Firefox.

**Option 2: local server**

```bash
python -m http.server 8000
```

Then visit http://localhost:8000 .

**Option 3: static hosting**

GitHub Pages, Cloudflare Pages, Vercel or Nginx all work. On HTTPS pages the HTTP-only ip-api is blocked as mixed content, so proxy / hosting flags have one source fewer; everything else works the same.

### Tips

- Add `?mask=1` to the URL to start with IPs masked
- Page URLs can be shared directly, e.g. `#/lookup?q=1.1.1.1`, `#/ping?target=1.1.1.1`, `#/whois?q=example.com`, `#/asn?q=AS13335`
- Switch theme in the top-right corner: system / light / dark

## How verdicts are made

### Split routing

- Domestic main exit: the IP seen most often by Chinese services; international main exit: the IP seen most often by international services and website traces
- One IPv4 exit means no split routing (no proxy, or a global proxy); two or more means split routing is active
- Services that disagree with the rest of their group are listed as exceptions — usually a domain your rules don't cover

### WebRTC

If any STUN server sees a public IP different from the international main exit, WebRTC leaks; if no public address is gathered at all, WebRTC is blocked.

### DNS

If any resolver is in a different country from the international main exit, there is a DNS leak risk.

### IP score (higher is more suspicious)

| Factor | Points |
|---|---|
| Flagged as proxy / VPN (ip-api) | +40 |
| Tor exit node (relay +10) | +50 |
| Hosting / data-center IP (ip-api, PeeringDB, ASN name) | +25 |
| Broadcast IP (RIR country differs from geolocation) | +10 |
| Each DNS blocklist listing | +15 (max 45) |
| StopForumSpam abuse records | +15–30 |

Capped at 100: below 20 low, below 50 medium, below 75 high, otherwise critical. The score is for reference only and is not equivalent to commercial fraud scores such as IPQS or Scamalytics.

### isChinaUser

| Signal | Weight |
|---|---|
| International sites see a Chinese IP | 35 |
| WebRTC exposes a Chinese IP | 25 |
| System time zone is in China | 25 |
| Google unreachable while Baidu is reachable | 20 |
| Preferred language is Simplified Chinese | 10 |
| DNS resolved by servers in China | 10 |
| A mainland-China exit IP exists | 10 |
| Simplified Chinese fonts installed | 5 |

A total of 60 or more means very likely, 30–59 likely, below 30 unlikely to be identified as a mainland-China user.

## Data sources

Every endpoint below was tested to be callable directly from a browser (CORS or JSONP).

| Purpose | Services |
|---|---|
| Chinese IP checks | IPIP.net, UpYun, DNSPod, NetEase, PConline, Tencent Video, ZXInc |
| International IP checks | Cloudflare, ipify, IP.SB, ipinfo, ipwho.is, ident.me, ipleak.net |
| Website traces / split test | Each site's Cloudflare `/cdn-cgi/trace` |
| Geolocation | ZXInc, Baidu, ip-api, IP.SB, ipwho.is, ipinfo |
| WebRTC | STUN servers of Xiaomi, Bilibili, Mango TV, Douyu, Google, Cloudflare and Twilio |
| DNS leak | ip-api EDNS, ipleak.net |
| IP score | ip-api, ident.me, PeeringDB, RIPEstat, Onionoo, StopForumSpam; SpamCop, DroneBL, UCEPROTECT, PSBL, Mailspike, s5h, dan.me.uk (queried via Google DoH) |
| Whois / ASN | rdap.org, IANA RDAP bootstrap, RIPEstat, PeeringDB |
| Global ping | check-host.net (falls back to Globalping) |
| Service status | Each service's Statuspage API, Google Cloud incidents |

Thanks to all of these services for their free APIs. Please use them responsibly and avoid hammering them.

## Privacy and security

- No backend; nothing is collected or uploaded. Every request goes straight from your browser to the services above, which see your IP — that is how the checks work
- The browser fingerprint is computed locally and never sent anywhere
- Four JSONP sources (NetEase, PConline, Tencent Video, Baidu) run third-party scripts in the page. A Content Security Policy allows scripts only from those domains, and the page holds no sensitive data
- IP lookup, global ping, Whois and ASN lookups send the target you type only when you ask for it
- Turn on "隐藏 IP" (hide IP) in the top-right corner before sharing screenshots

## Project layout

```
index.html              Page shell (top bar, navigation, view container)
css/style.css           Styles (light / dark themes)
js/
  util.js               Requests, JSONP, DoH, IP helpers
  sources.js            IP check sources
  geo.js                Geolocation (merged sources, concurrency limit, database comparison)
  webrtc.js             WebRTC / STUN checks
  dns.js                DNS leak test
  connectivity.js       Site connectivity
  analyze.js            Exit grouping, routing / leak verdicts, IP type, text report
  risk.js               IP score
  whois.js              RDAP and ASN data
  gping.js              Global ping
  svcstatus.js          Service status
  fingerprint.js        Browser fingerprint
  china.js              isChinaUser
  splittest.js          Site exit tests
  ipcard.js             IP card drawing
  core.js               Core check scheduling and subscriptions
  ui.js router.js app.js  Shared components, router, bootstrap
  pages/*.js            Pages
tests/                  Unit tests (node --test)
docs/                   Design doc and screenshots
```

Zero dependencies and no build step. Classic `<script>` tags (not ES modules) keep it working from `file://`.

## Development

```bash
npm test     # Node.js 18+, no install needed
npm start    # same as python -m http.server 8000
```

## Known limitations

- Third-party APIs may change, rate-limit, or be interfered with on some networks; one failing source does not affect the others
- Geolocation databases disagree with each other; locations and IP types are for reference only
- TLDs such as `.cn` and `.io` have no public RDAP service, so Whois is unavailable for them
- Connectivity latency is measured with HTTP requests and is not the same as ping
- Browser extensions (ad blockers, WebRTC protection, …) may block some requests
- Red network errors in the browser console (e.g. IPv6 endpoints failing without IPv6, some favicons returning 404) are expected

## License

[MIT](LICENSE)

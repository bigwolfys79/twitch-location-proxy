# 🌍 Twitch Location Proxy

[🇷🇺 Русская версия](README.ru.md)

A Firefox extension + Cloudflare Worker that **unblocks 2K/1440p** on Twitch and
changes the location your browser exposes. Video segments are fetched directly
— no impact on stream speed.

[![Firefox](https://img.shields.io/badge/browser-Firefox-ff7139)](https://www.mozilla.org/firefox/)
[![Cloudflare Workers](https://img.shields.io/badge/backend-Cloudflare%20Workers-f38020)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#-license)
[![Price](https://img.shields.io/badge/price-free-4cbd6b)](#)

## How it works

Twitch decides whether to grant you 2K/1440p at playback-token time — based on
the requester IP and login state. The extension routes **only the small
playback metadata requests** through your personal Worker hosted in an allowed
region (Germany/France/Netherlands):

| Request | Path | Purpose |
|---|---|---|
| GQL token (`gql.twitch.tv`) | → Worker → Durable Object (EU) | Twitch evaluates region (`AUTHZ_GEO`) and login (`AUTHZ_NOT_LOGGED_IN`) here. The Authorization header is forwarded securely |
| usher (master playlist) | → Worker → DO | The Worker requests all codecs (`av1,h265,h264`) — otherwise Twitch omits the 1440p source variant |
| Media playlists | direct | No geo decisions involved |
| Video segments | direct | Full stream speed |

## Setup

### 1. Your own Worker (10 minutes, free)

The extension does **not** ship with a shared Worker — every user deploys their
own, keeping limits and logs personal. Step-by-step guide:
**[Tehnichka.md](Tehnichka.md)** — Cloudflare account → paste `worker.js` →
one binding → paste the worker URL into the extension settings.

One-command alternative (after `npx wrangler login`): `npx wrangler deploy`

### 2. The extension

- **Temporary**: `about:debugging` → "Load Temporary Add-on" → pick the `.xpi`
- **Permanent**: a Mozilla-signed `.xpi` (see signing below) — drag it into the browser window
- Then click the 🌍 toolbar icon → paste your worker URL → **Save**

### 3. Requirements for 2K

| Requirement | Why |
|---|---|
| Logged into Twitch | anonymous viewers get capped by `AUTHZ_NOT_LOGGED_IN` |
| HEVC codec in the OS (Windows Store / Device Manufacturer pack) | most 1440p sources are HEVC; verify: `MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L150.90"')` → `true` |
| `media.hevc.enabled = true` in `about:config` | Firefox HEVC switch |
| GPU with hardware HEVC decode | Intel 6th gen+, NVIDIA 950+, AMD RX 400+ |

Channels whose 1440p source is **AV1** work without the HEVC codec.

## Project files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V2 for Firefox |
| `background.js` | Intercepts the GQL token request (Authorization → `&auth=`) and usher |
| `content.js` | Fallback `fetch` interceptor on the page |
| `popup.html/js`, `options.html/js` | Settings: your worker URL, on/off toggle |
| `worker.js` | Cloudflare Worker + Durable Object (`locationHint: weur`) |
| `wrangler.toml` | Deploy config: `npx wrangler deploy` |
| `Tehnichka.md` | Full worker setup guide + troubleshooting |

## Signing for permanent installation

Regular Firefox requires a Mozilla signature. Two ways:

1. **Self-signing via AMO** (unlisted, instant):
   ```bash
   npx web-ext sign --source-dir . --artifacts-dir signed \
     --api-key=USER --api-secret=SECRET --channel=unlisted
   ```
2. **Store listing**: [AMO submission form](https://addons.mozilla.org/developers/addon/submit/) →
   upload the build → fill in the listing → moderation

## License

MIT — do whatever you want, a link back is appreciated.

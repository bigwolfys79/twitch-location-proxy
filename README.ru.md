# 🌍 Twitch Location Proxy

[🇬🇧 English version](README.md)

Расширение для Firefox + Cloudflare Worker: **разблокирует 2K/1440p** на Twitch
и меняет видимую браузеру локацию. Видеосегменты качаются напрямую — скорость
потока не страдает.

[![Firefox](https://img.shields.io/badge/browser-Firefox-ff7139)](https://www.mozilla.org/firefox/)
[![Cloudflare Workers](https://img.shields.io/badge/backend-Cloudflare%20Workers-f38020)](https://workers.cloudflare.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](#-лицензия)
[![Price](https://img.shields.io/badge/price-0%20₽-4cbd6b)](#)

## Как это работает

Twitch решает, давать ли тебе 2K/1440p, в момент запроса токена воспроизведения
— по IP и по логину. Расширение перенаправляет **только служебные запросы**
через твой личный воркер в разрешённом регионе (Германия/Франция/Нидерланды):

| Запрос | Путь | Зачем |
|---|---|---|
| GQL-токен (`gql.twitch.tv`) | → Worker → Durable Object (Европа) | Здесь Twitch решает гео (`AUTHZ_GEO`) и вход (`AUTHZ_NOT_LOGGED_IN`). Authorization передаётся безопасно |
| usher (master-плейлист) | → Worker → DO | Воркер запрашивает все кодеки (`av1,h265,h264`) — иначе Twitch не отдаёт 1440p-исходник |
| Медиа-плейлисты | напрямую | Гео не решают |
| Видеосегменты | напрямую | Скорость потока |

## Установка

### 1. Свой воркер (10 минут, бесплатно)

Расширение **не зашивает** чужой воркер — у каждого свой лимит и свои логи.
Пошаговый гайд: **[Tehnichka.md](Tehnichka.md)** — аккаунт Cloudflare → вставить
`worker.js` → одна привязка → адрес воркера в настройки расширения.

Либо одной командой (после `npx wrangler login`): `npx wrangler deploy`

### 2. Расширение

- **Временно**: `about:debugging` → «Загрузить временное дополнение» → файл `.xpi`
- **Навсегда**: подписанный `.xpi` (см. раздел подписи ниже) → перетащи в окно браузера
- Затем клик по иконке 🌍 → вставь адрес своего воркера → **Сохранить**

### 3. Требования для 2K

| Требование | Почему |
|---|---|
| Логин в Twitch | анонимам Twitch держит капу разрешения |
| HEVC-кодек в системе (Windows Store / Device Manufacturer pack) | 1440p-исходники обычно в HEVC; проверка: `MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L150.90"')` → `true` |
| `media.hevc.enabled = true` в `about:config` | переключатель Firefox |
| GPU с аппаратным HEVC | Intel 6-го поколения+, NVIDIA 950+, AMD RX 400+ |

Каналы с 1440p-исходником в **AV1** работают без HEVC-кодека.

## Файлы проекта

| Файл | Назначение |
|---|---|
| `manifest.json` | Manifest V2 для Firefox |
| `background.js` | Перехват GQL-токена (Authorization → `&auth=`) и usher |
| `content.js` | Страховочный перехват `fetch` на странице |
| `popup.html/js`, `options.html/js` | Настройки: свой воркер, вкл/выкл |
| `worker.js` | Код Cloudflare Worker + Durable Object (`locationHint: weur`) |
| `wrangler.toml` | Конфиг деплоя: `npx wrangler deploy` |
| `Tehnichka.md` | Полный гайд по созданию воркера + диагностика |


## Лицензия

MIT — делайте что хотите, ссылка на проект приветствуется.

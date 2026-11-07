/**
 * Twitch Location Proxy — background script.
 *
 * Перенаправляет через Cloudflare Worker только служебные запросы Twitch,
 * по которым сервер определяет локацию/качество:
 *   - usher.ttvnw.net        (PlaybackAccessToken / master playlist)
 *   - video-weaver.*.ttvnw.net (hls playlist с рекламой/сегментами)
 *
 * Сегменты видео (video-edge-*.ttvnw.net) НЕ трогаем — они идут напрямую,
 * поэтому сам поток качается с обычной скоростью.
 */

// Воркер по умолчанию НЕ зашит: каждый пользователь указывает свой
// в настройках расширения (см. Tehnichka.md). Без воркера расширение
// не вмешивается в трафик.
const DEFAULT_WORKER = "";

let settings = {
  enabled: true,
  workerUrl: DEFAULT_WORKER,
};

function normalize(url) {
  return (url || "").trim().replace(/\/+$/, "");
}

// Отказоустойчивое чтение настроек: storage.sync может быть недоступен
// (например, если Firefox Sync отключён) — тогда пробуем storage.local,
// а если и это не вышло, работаем с настройками по умолчанию.
async function loadSettings() {
  const defaults = { enabled: true, workerUrl: DEFAULT_WORKER };
  for (const area of ["sync", "local"]) {
    try {
      const storage = browser.storage[area];
      if (!storage || !storage.get) continue;
      const saved = await storage.get(defaults);
      settings.enabled = saved.enabled !== false;
      settings.workerUrl = normalize(saved.workerUrl);
      return;
    } catch (e) {
      // пробуем следующее хранилище
    }
  }
}

function watchStorage() {
  for (const area of ["sync", "local"]) {
    try {
      browser.storage[area].onChanged.addListener((changes) => {
        if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
        if (changes.workerUrl) settings.workerUrl = normalize(changes.workerUrl.newValue);
      });
    } catch (e) {
      // хранилище недоступно — пропускаем
    }
  }
}

loadSettings();
watchStorage();

// Пропускаем напрямую:
//  - сегменты (*.hls.ttvnw.net: video-edge-*, *.j.cloudfront.hls.*)
//  - медиа-плейлисты (*.playlist.ttvnw.net): гео-решение принимает токен,
//    а проксирование плейлиста вызывает спорадические 403 (Twitch привязывает
//    выдачу плейлиста к IP, с которого запрошен токен).
// Через Worker идут только gql-токены и usher (master-плейлист).
const DIRECT_RE = /^https?:\/\/[a-z0-9.-]+\.(?:hls|playlist)\.ttvnw\.net\//i;

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!settings.enabled || !settings.workerUrl) return {};
    // Страницы/ифреймы не трогаем — только запросы плеера.
    if (details.type === "main_frame" || details.type === "sub_frame") return {};
    if (DIRECT_RE.test(details.url)) return {};

    const proxied = `${settings.workerUrl}/proxy?url=${encodeURIComponent(details.url)}`;
    console.log("[TLP] proxying:", details.url.slice(0, 140));
    return { redirectUrl: proxied };
  },
  { urls: ["*://*.ttvnw.net/*"] },
  ["blocking"]
);

// GQL-запросы за токеном воспроизведения: редирект срезает Authorization,
// поэтому вытаскиваем его в onBeforeSendHeaders и передаём воркеру в URL
// (&auth=...), а воркер восстанавливает заголовок. Пометку "это запрос
// токена" делаем в onBeforeRequest (там доступно тело) по requestId.
const TOKEN_OPS = ["streamPlaybackAccessToken", "videoPlaybackAccessToken", "PlaybackAccessToken"];
const tokenRequestIds = new Set();

function isTokenRequestBody(details) {
  const body = details.requestBody;
  if (!body) return false;
  let text = "";
  if (body.raw && body.raw.length) {
    text = body.raw.map((p) => new TextDecoder().decode(p.bytes || new ArrayBuffer(0))).join("");
  } else if (body.formData) {
    text = JSON.stringify(body.formData);
  }
  return TOKEN_OPS.some((op) => text.includes(op));
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!settings.enabled) return {};
    if (details.method !== "POST") return {};
    if (!isTokenRequestBody(details)) return {};
    tokenRequestIds.add(details.requestId);
    return {}; // сам редирект делаем в onBeforeSendHeaders, где есть заголовки
  },
  { urls: ["*://gql.twitch.tv/*"] },
  ["blocking", "requestBody"]
);

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!settings.enabled || !settings.workerUrl) return {};
    if (!tokenRequestIds.has(details.requestId)) return {};
    tokenRequestIds.delete(details.requestId);
    const auth = (details.requestHeaders || []).find(
      (h) => h.name.toLowerCase() === "authorization"
    );
    const authParam = auth ? `&auth=${encodeURIComponent(auth.value)}` : "";
    const proxied = `${settings.workerUrl}/proxy?url=${encodeURIComponent(details.url)}${authParam}`;
    console.log("[TLP] GQL токен → воркер", auth ? "(с Authorization)" : "(анонимно)");
    return { redirectUrl: proxied };
  },
  { urls: ["*://gql.twitch.tv/*"] },
  ["blocking", "requestHeaders"]
);

// ВРЕМЕННАЯ диагностика: логируем упавшие запросы.
browser.webRequest.onErrorOccurred.addListener(
  (details) => console.log("[TLP] FAILED:", details.error, "|", details.url.slice(0, 140)),
  { urls: ["*://*.ttvnw.net/*", "*://*.workers.dev/*"] }
);

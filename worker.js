/**
 * Twitch Location Proxy — Cloudflare Worker + Durable Object (weur egress).
 *
 * Схема:
 *   запрос → воркер → Durable Object (locationHint: weur, Западная Европа:
 *   Германия/Франция/Нидерланды) → gql.twitch.tv / *.ttvnw.net → назад.
 *
 * Разрешения 1440p/4K (QUAD_HD/ULTRA_HD) Twitch проверяет по гео IP,
 * с которого запрашивается токен. PL/BY в чёрном списке, DE/FR/NL/US — в белом.
 *
 * Если привязка DO (US_RELAY) не настроена — воркер работает напрямую
 * (стрим играет, но максимум 1080p).
 *
 * НАСТРОЙКА (после вставки кода):
 *   Settings → Bindings → Add binding → Durable Object Namespace:
 *     Class name: USRelay
 *     Namespace:  создай новый, имя US_RELAY
 *
 * Эндпоинты:
 *   GET /                     → статус
 *   ANY /proxy?url=<encoded>  → проксирование на *.ttvnw.net / gql.twitch.tv
 */

const ALLOWED_HOST_SUFFIX = ".ttvnw.net";
const ALLOWED_GQL_HOST = "gql.twitch.tv";

// Заголовки, которые нельзя/не нужно пересылать наверх.
const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-trace-id",
  "cf-ew-via",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-real-ip",
  "accept-encoding",
  "content-length",
]);

// Заголовки ответа, которые не годятся для кросс-доменного ответа.
const SKIP_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "x-frame-options",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
]);

// CORS-заголовки: эхо Origin вместо '*' — с credentialsMode='include'
// и в preflight-ответах wildcard '*' по спецификации не работает.
function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
  };
  if (origin !== "*") {
    headers["vary"] = "Origin";
  }
  const reqHeaders = request.headers.get("access-control-request-headers");
  if (reqHeaders) {
    headers["access-control-allow-headers"] = reqHeaders;
  }
  return headers;
}

async function relay(request, relayTag) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    const headers = corsHeaders(request);
    headers["access-control-allow-methods"] = "GET, HEAD, POST, OPTIONS";
    return new Response(null, { status: 204, headers });
  }

  const targetRaw = url.searchParams.get("url");
  if (!targetRaw) {
    return new Response("Missing ?url= parameter", { status: 400, headers: corsHeaders(request) });
  }

  let target;
  try {
    target = new URL(targetRaw);
  } catch {
    return new Response("Invalid ?url= parameter", { status: 400, headers: corsHeaders(request) });
  }

  const host = target.hostname;
  const hostAllowed = host === ALLOWED_GQL_HOST || host.endsWith(ALLOWED_HOST_SUFFIX);
  if (target.protocol !== "https:" || !hostAllowed) {
    return new Response("Only https://*.ttvnw.net and https://gql.twitch.tv are allowed", {
      status: 403,
      headers: corsHeaders(request),
    });
  }

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (!SKIP_REQUEST_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }

  // Авторизация, переданная расширением в параметре (редирект срезает
  // заголовок Authorization, поэтому она едет в query). Только для GQL.
  const authParam = url.searchParams.get("auth");
  if (authParam && target.hostname === ALLOWED_GQL_HOST) {
    headers.set("authorization", authParam);
  }

  // usher: принудительно запрашиваем все кодеки — иначе Twitch не отдаёт
  // EB-исходник 1440p, если плеер не заявил поддержку h265.
  if (target.hostname === "usher.ttvnw.net") {
    target.searchParams.set("supported_codecs", "av1,h265,h264");
    if (!target.searchParams.has("allow_source")) {
      target.searchParams.set("allow_source", "true");
    }
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    for (const [name, value] of upstream.headers) {
      const lower = name.toLowerCase();
      if (lower.startsWith("cf-") || SKIP_RESPONSE_HEADERS.has(lower)) continue;
      responseHeaders.set(name, value);
    }
    for (const [name, value] of Object.entries(corsHeaders(request))) {
      responseHeaders.set(name, value);
    }
    // Отладка: каким путём шёл запрос ("do-weur" / "direct").
    responseHeaders.set("x-tlp-relay", relayTag);
    // Отдаём тело потоком — плейлисты и редиректы идут как есть.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502, headers: corsHeaders(request) });
  }
}

// Durable Object: исполняется в указанном регионе (weur = Западная Европа),
// все fetch() наружу идут с локального для этого региона IP.
export class USRelay {
  constructor(state, env) {}

  async fetch(request) {
    return relay(request, "do-weur");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Twitch Location Proxy is Running! (weur relay)", { status: 200 });
    }

    if (url.pathname === "/proxy") {
      // Fallback: без привязки DO работаем напрямую (1080p, но стрим живой).
      if (!env.US_RELAY) {
        return relay(request, "direct-fallback");
      }
      const stub = env.US_RELAY.get(env.US_RELAY.idFromName("eu-relay"), { locationHint: "weur" });
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

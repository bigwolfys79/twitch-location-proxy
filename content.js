/**
 * Контент-скрипт: перехватываем fetch на странице Twitch.
 *
 * Зачем: webRequest-редирект на воркер срезает Authorization при
 * кросс-доменном переходе (требование fetch-спеки), и Twitch получает
 * анонимный токен → «Вы вышли из системы». Поэтому запрос за токеном
 * воспроизведения отправляем НАПРЯМУЮ на Worker — заголовки сохраняются.
 *
 * Firefox-специфика: контент-скрипт живёт в песочнице, в контекст страницы
 * попадаем через wrappedJSObject + exportFunction (CSP twitch.tv не мешает —
 * инлайн-скрипты не используются).
 */

(function () {
  try {
    const pageWindow = window.wrappedJSObject;
    if (!pageWindow || typeof pageWindow.fetch !== "function" || !window.exportFunction) return;

    // Воркер по умолчанию не зашит: пока пользователь не укажет свой
    // в настройках, перехватчик работает вхолостую (см. Tehnichka.md).
    let workerBase = "";
    try {
      browser.storage.sync
        .get({ workerUrl: "" })
        .then(({ workerUrl: saved }) => {
          if (saved) workerBase = String(saved).trim().replace(/\/+$/, "");
        })
        .catch(() => {});
    } catch (e) {
      // storage.sync недоступен — работаем с дефолтом
    }

    // "Чистый" fetch песочницы (до патча).
    const rawFetch = window.fetch.bind(window);

    function urlOf(input) {
      try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url;
      } catch (e) {}
      return "";
    }

    function bodyOf(input, init) {
      try {
        let b = (init && init.body) || (input && input.body) || "";
        if (!b) return "";
        if (typeof b === "string") return b;
        if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) return b.toString();
        const s = String(b);
        return s === "[object Object]" ? "" : s;
      } catch (e) {
        return "";
      }
    }

    // Перехватываем только запросы за токеном воспроизведения.
    function isTokenCall(input, init) {
      if (!workerBase) return false;
      if (!/^https:\/\/gql\.twitch\.tv\/gql(\?|$)/.test(urlOf(input))) return false;
      return bodyOf(input, init).includes("PlaybackAccessToken");
    }

    const patched = exportFunction(function (input, init) {
      try {
        const u = urlOf(input);
        if (/^https:\/\/gql\.twitch\.tv\/gql(\?|$)/.test(u)) {
          if (isTokenCall(input, init)) {
            const target = workerBase + "/proxy?url=" + encodeURIComponent(u);
            console.log("[TLP] page-fetch: запрос токена → воркер (с Authorization)");
            // init передаём как есть: Authorization и Client-ID дойдут напрямую.
            return rawFetch(target, init);
          }
          console.log("[TLP] page-fetch: gql запрос пропущен (body:", typeof (init && init.body), ")");
        }
      } catch (e) {
        console.error("[TLP] page-fetch error:", e);
      }
      return rawFetch(input, init);
    }, pageWindow);

    pageWindow.fetch = patched;
    console.log("[TLP] page-fetch: перехват установлен");
  } catch (e) {
    console.error("[TLP] content script failed:", e);
  }
})();

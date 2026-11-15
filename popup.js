const powerEl = document.getElementById("power");
const stateEl = document.getElementById("stateText");
const geoCardEl = document.getElementById("geoCard");
const geoMainEl = document.getElementById("geoMain");
const geoSubEl = document.getElementById("geoSub");

// Воркер по умолчанию не зашит — каждый указывает свой (Tehnichka.md).
const DEFAULT_WORKER = "";

let settings = { enabled: true, workerUrl: DEFAULT_WORKER };

// Отказоустойчивое чтение настроек: sync → local → значения по умолчанию.
function readSettings() {
  let chain = Promise.reject();
  for (const area of ["sync", "local"]) {
    chain = chain.catch(() => {
      const storage = browser.storage[area];
      if (!storage || !storage.get) return Promise.reject(new Error(area));
      return storage.get({ enabled: true, workerUrl: DEFAULT_WORKER });
    });
  }
  return chain.catch(() => ({ enabled: true, workerUrl: DEFAULT_WORKER }));
}

// --- Кнопка питания -------------------------------------------------------

function paintState() {
  const hasWorker = Boolean(settings.workerUrl);
  const active = settings.enabled && hasWorker;
  powerEl.classList.toggle("on", active);
  powerEl.classList.toggle("off", !settings.enabled);
  powerEl.classList.toggle("warn", settings.enabled && !hasWorker);
  stateEl.classList.toggle("on", active);
  stateEl.classList.toggle("off", !settings.enabled);
  stateEl.classList.toggle("warn", settings.enabled && !hasWorker);
  // Пока воркер не указан, карточка гео подсказывает и открывает настройки.
  geoCardEl.classList.toggle("action", settings.enabled && !hasWorker);
  if (!settings.enabled) {
    stateEl.textContent = "Выключено — идём напрямую";
  } else if (hasWorker) {
    stateEl.textContent = "Включено — через воркер";
  } else {
    stateEl.textContent = "Воркер не указан";
  }
}

powerEl.addEventListener("click", async () => {
  settings.enabled = !settings.enabled;
  paintState();
  refreshGeo();
  const saved = { enabled: settings.enabled };
  try {
    await browser.storage.sync.set(saved);
  } catch (e) {
    await browser.storage.local.set(saved);
  }
});

// --- «Откуда Twitch думает, что ты» ---------------------------------------
// Воркер отвечает /geo: cdn-cgi/trace выполняется там же, откуда уходят
// usher/GQL-запросы, значит ip/loc/colo — это ровно то, что видит Twitch.

const COUNTRIES = {
  DE: "Германия", FR: "Франция", NL: "Нидерланды", PL: "Польша",
  GB: "Великобритания", US: "США", CA: "Канада", SE: "Швеция",
  NO: "Норвегия", FI: "Финляндия", DK: "Дания", AT: "Австрия",
  CH: "Швейцария", BE: "Бельгия", IT: "Италия", ES: "Испания",
  PT: "Португалия", CZ: "Чехия", IE: "Ирландия", LU: "Люксембург",
  EE: "Эстония", LV: "Латвия", LT: "Литва", UA: "Украина",
};

// Коды ПоИнтерколо Cloudflare → города (частые для EU/US egress).
const COLO_CITIES = {
  FRA: "Франкфурт", DUS: "Дюссельдорф", HAM: "Гамбург", BER: "Берлин",
  MUC: "Мюнхен", STR: "Штутгарт", CGN: "Кёльн", NUE: "Нюрнберг",
  AMS: "Амстердам", EIN: "Эйндховен", CDG: "Париж", MRS: "Марсель",
  LHR: "Лондон", MAN: "Манчестер", WAW: "Варшава", PRG: "Прага",
  VIE: "Вена", ZRH: "Цюрих", BRU: "Брюссель", MXP: "Милан",
  FCO: "Рим", MAD: "Мадрид", BCN: "Барселона", LIS: "Лиссабон",
  DUB: "Дублин", ARN: "Стокгольм", OSL: "Осло", CPH: "Копенгаген",
  HEL: "Хельсинки", IAD: "Ашберн", MIA: "Майами", LAX: "Лос-Анджелес",
  ORD: "Чикаго", DFW: "Даллас", EWR: "Ньюарк", SJC: "Сан-Хосе",
  ATL: "Атланта", DEN: "Денвер", SEA: "Сиэтл",
};

function paintGeo(info) {
  const city = COLO_CITIES[info.colo];
  const country = COUNTRIES[info.loc] || info.loc || "";
  // Город колокации — главное: страна egress-IP в базе Cloudflare бывает
  // фиктивной (у CF-диапазонов регистрация не всегда совпадает с географией).
  const main = city ? `${city} (${info.colo})` : info.colo || "—";
  const sub = [];
  if (country) sub.push(`страна по базе CF: ${country}`);
  if (info.ip) sub.push(`IP ${info.ip}`);
  if (info.relay === "do-weur") sub.push("через DO (weur)");
  else if (info.relay) sub.push("без DO — прямая выдача воркера");
  geoMainEl.textContent = main;
  geoSubEl.textContent = sub.join(" · ");
}

function paintGeoMessage(main, sub, warn) {
  geoMainEl.textContent = main;
  geoSubEl.textContent = sub || "";
  geoMainEl.style.color = warn ? "#ffbf3f" : "#efeff1";
}

async function refreshGeo() {
  if (!settings.enabled) {
    paintGeoMessage("Прокси выключен", "Twitch видит твой реальный IP");
    return;
  }
  if (!settings.workerUrl) {
    paintGeoMessage("Добавь воркер", "Клик по карточке или шестерёнке — откроются настройки", true);
    return;
  }
  paintGeoMessage("Определяем…");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${settings.workerUrl}/geo`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const info = await r.json();
    paintGeo(info);
  } catch (e) {
    paintGeoMessage(
      "Не удалось определить",
      "Обнови код воркера (worker.js из версии 1.2+) и проверь адрес",
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

// --- Инициализация --------------------------------------------------------

readSettings().then((saved) => {
  settings.enabled = saved.enabled !== false;
  settings.workerUrl = (saved.workerUrl || "").trim().replace(/\/+$/, "");
  paintState();
  refreshGeo();
});

// Пока попап открыт, следим за изменениями настроек (например, из options-страницы).
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" && area !== "local") return;
  let touched = false;
  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue !== false;
    touched = true;
  }
  if (changes.workerUrl) {
    settings.workerUrl = (changes.workerUrl.newValue || "").trim().replace(/\/+$/, "");
    touched = true;
  }
  if (touched) {
    paintState();
    refreshGeo();
  }
});

document.getElementById("openSettings").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

// Клик по карточке гео в режиме «Добавь воркер» → настройки.
geoCardEl.addEventListener("click", () => {
  if (settings.enabled && !settings.workerUrl) browser.runtime.openOptionsPage();
});

const PROJECT_URL = "https://github.com/bigwolfys79/twitch-location-proxy";
document.getElementById("help").addEventListener("click", () => {
  browser.tabs.create({ url: PROJECT_URL });
  window.close();
});

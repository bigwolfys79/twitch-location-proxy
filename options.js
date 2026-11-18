const enabledEl = document.getElementById("enabled");
const workerEl = document.getElementById("worker");
const statusEl = document.getElementById("status");

browser.storage.sync
  .get({ enabled: true, workerUrl: "" })
  .then(async ({ enabled, workerUrl }) => {
    enabledEl.checked = enabled !== false;
    if (workerUrl) workerEl.value = workerUrl;
    // Обновление со старой версии: воркер задан, а опционального доступа ещё нет
    // (раньше был <all_urls>). Просим подтвердить при первом же действии — сохранении.
    if (workerUrl) await warnIfNoWorkerPermission(workerUrl);
  })
  .catch(() => {});

// Держим чекбокс в актуальном состоянии (тумблер в попапе мог переключить).
for (const area of ["sync", "local"]) {
  try {
    browser.storage[area].onChanged.addListener((changes) => {
      if (changes.enabled) enabledEl.checked = changes.enabled.newValue !== false;
    });
  } catch (e) {
    // хранилище недоступно — пропускаем
  }
}

// Доступ к воркеру — опциональное разрешение на его домен: без него фетчи
// на /geo и редиректы на воркер не пройдут (https://*/* в манифесте — только
// как вариант для запроса, само по себе ничего не даёт).
async function hasWorkerPermission(workerUrl) {
  try {
    return await browser.permissions.contains({ origins: [`${workerUrl}/*`] });
  } catch (e) {
    return false;
  }
}

async function warnIfNoWorkerPermission(workerUrl) {
  if (await hasWorkerPermission(workerUrl)) return false;
  statusEl.textContent = "Воркер задан, но доступ к нему не выдан — нажми «Сохранить» и подтверди";
  statusEl.style.color = "#ffbf3f";
  return true;
}

document.getElementById("save").addEventListener("click", async () => {
  const workerUrl = workerEl.value.trim().replace(/\/+$/, "");
  if (workerUrl && !/^https:\/\/[a-z0-9.-]+/i.test(workerUrl)) {
    statusEl.textContent = "Неверный адрес (нужен https://...)";
    statusEl.style.color = "#ff8282";
    return;
  }
  if (workerUrl) {
    // permissions.request обязан вызываться из жеста пользователя — клик «Сохранить» подходит.
    const granted = await browser.permissions.request({ origins: [`${workerUrl}/*`] });
    if (!granted) {
      statusEl.textContent = "Без доступа к воркеру гео-карточка и проксирование не заработают";
      statusEl.style.color = "#ffbf3f";
      return;
    }
  }
  await browser.storage.sync.set({
    enabled: enabledEl.checked,
    workerUrl: workerUrl || undefined,
  });
  statusEl.textContent = "Сохранено ✓";
  statusEl.style.color = "#4cbd6b";
  setTimeout(() => (statusEl.textContent = ""), 2000);
});

const PROJECT_URL = "https://github.com/bigwolfys79/twitch-location-proxy";
document.getElementById("help").addEventListener("click", () => {
  browser.tabs.create({ url: PROJECT_URL });
});

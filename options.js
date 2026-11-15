const enabledEl = document.getElementById("enabled");
const workerEl = document.getElementById("worker");
const statusEl = document.getElementById("status");

browser.storage.sync
  .get({ enabled: true, workerUrl: "" })
  .then(({ enabled, workerUrl }) => {
    enabledEl.checked = enabled !== false;
    if (workerUrl) workerEl.value = workerUrl;
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

document.getElementById("save").addEventListener("click", async () => {
  const workerUrl = workerEl.value.trim().replace(/\/+$/, "");
  if (workerUrl && !/^https:\/\/[a-z0-9.-]+/i.test(workerUrl)) {
    statusEl.textContent = "Неверный адрес (нужен https://...)";
    statusEl.style.color = "#ff8282";
    return;
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

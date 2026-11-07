const enabledEl = document.getElementById("enabled");
const workerEl = document.getElementById("worker");
const statusEl = document.getElementById("status");

// Воркер по умолчанию не зашит — каждый указывает свой (Tehnichka.md).
const DEFAULT_WORKER = "";

function readSettings() {
  let chain = Promise.reject();
  for (const area of ["sync", "local"]) {
    chain = chain.catch(() => {
      const storage = browser.storage[area];
      if (!storage || !storage.get) return Promise.reject(new Error(area));
      return storage.get({ enabled: true, workerUrl: "" });
    });
  }
  return chain.catch(() => ({ enabled: true, workerUrl: "" }));
}

readSettings().then(({ enabled, workerUrl }) => {
  enabledEl.checked = enabled !== false;
  workerEl.value = workerUrl || "";
  if (!workerUrl) {
    statusEl.textContent = "Укажи свой воркер (Tehnichka.md)";
    statusEl.style.color = "#ffbf3f";
  }
});

document.getElementById("save").addEventListener("click", async () => {
  const workerUrl = workerEl.value.trim().replace(/\/+$/, "");
  if (workerUrl && !/^https:\/\/[a-z0-9.-]+/i.test(workerUrl)) {
    statusEl.textContent = "Нужен https://...";
    statusEl.style.color = "#ff8282";
    return;
  }
  const saved = { enabled: enabledEl.checked };
  if (workerUrl) saved.workerUrl = workerUrl;
  try {
    await browser.storage.sync.set(saved);
  } catch (e) {
    await browser.storage.local.set(saved);
  }
  statusEl.textContent = "Сохранено ✓";
  statusEl.style.color = "#4cbd6b";
  setTimeout(() => (statusEl.textContent = ""), 2000);
});

document.getElementById("openOptions").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
});

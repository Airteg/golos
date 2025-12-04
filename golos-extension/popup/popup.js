function renderStatus(health) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const detailEl = document.getElementById("detail");

  if (!health || health.ok === null) {
    dot.className = "dot";
    text.textContent = "Статус невідомий";
    detailEl.textContent = "";
    return;
  }

  if (health.ok) {
    dot.className = "dot ok";
    text.textContent = "🟢 Golos Online";
    const model =
      health.detail && health.detail.model ? health.detail.model : "unknown";
    const latency =
      health.detail && typeof health.detail.latencyMs === "number"
        ? `${health.detail.latencyMs} ms`
        : "—";
    detailEl.textContent = `model: ${model}\nlatency: ${latency}`;
  } else {
    dot.className = "dot bad";
    text.textContent = "🔴 Golos Offline";

    let detail = "";
    if (health.reason) detail += `reason: ${health.reason}\n`;
    if (health.detail) detail += `detail: ${health.detail}`;
    detailEl.textContent = detail.trim();
  }
}

function requestStatus(force = false) {
  chrome.runtime.sendMessage(
    { type: "GOLOS_GET_STATUS", force },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Golos popup] sendMessage error:",
          chrome.runtime.lastError.message
        );
        renderStatus(null);
        return;
      }
      renderStatus(response);
    }
  );
}

function loadMode() {
  chrome.storage.sync.get({ golosMode: "uk-clean" }, (result) => {
    const select = document.getElementById("mode-select");
    if (!select) return;
    select.value = result.golosMode || "uk-clean";
  });
}

function saveMode(value) {
  chrome.storage.sync.set({ golosMode: value }, () => {
    console.log("[Golos popup] Mode saved:", value);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("dictation-toggle");
  if (!btn) return;

  btn.textContent = "Відкрити панель диктування";

  btn.addEventListener("click", () => {
    // 1. Знаходимо активну вкладку в поточному вікні (де ти натиснув іконку)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (tab && typeof tab.id === "number") {
        // 2. Кажемо background’у: ось цільова вкладка для диктування
        chrome.runtime.sendMessage(
          { type: "GOLOS_SET_DICTATION_TARGET", tabId: tab.id },
          () => {
            // 3. Відкриваємо плаваючу панель
            chrome.windows.create({
              url: "../legacy/dictation.html",
              type: "popup",
              width: 260,
              height: 170,
              focused: true,
            });
          }
        );
      } else {
        // Фолбек: якщо з якоїсь причини вкладку не знайшли — хоча б відкриємо панель
        chrome.windows.create({
          url: "../legacy/dictation.html",
          type: "popup",
          width: 260,
          height: 170,
          focused: true,
        });
      }
    });
  });
});

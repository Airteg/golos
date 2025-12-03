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
  requestStatus(false);
  loadMode();

  const btn = document.getElementById("refresh");
  btn.addEventListener("click", () => {
    requestStatus(true);
  });

  const select = document.getElementById("mode-select");
  select.addEventListener("change", (e) => {
    const value = e.target.value;
    saveMode(value);
  });

  // --- Dictation UI ---

  let dictationActive = false;
  const dictBtn = document.getElementById("dictation-toggle");
  const dictStatus = document.getElementById("dictation-status");

  function updateDictationUI() {
    if (!dictBtn || !dictStatus) return;

    if (dictationActive) {
      dictBtn.textContent = "⏹ Зупинити диктування";
      dictStatus.textContent = "Слухаю… Активне поле на сторінці.";
    } else {
      dictBtn.textContent = "🎙 Почати диктування";
      dictStatus.textContent = "";
    }
  }

  dictBtn.addEventListener("click", () => {
    const type = dictationActive
      ? "GOLOS_STOP_DICTATION"
      : "GOLOS_START_DICTATION";

    chrome.runtime.sendMessage({ type }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Golos popup] Dictation sendMessage error:",
          chrome.runtime.lastError.message
        );
        return;
      }

      if (!response || response.ok === false) {
        console.warn("[Golos popup] Dictation response error:", response);
        return;
      }

      dictationActive = !dictationActive;
      updateDictationUI();
    });
  });

  updateDictationUI();
});

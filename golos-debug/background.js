// ! Всі коментарі зроблені для майбутнього мене,
// ! коли я вже не буду пам'ятати, про що була мова.
// background.js — Фінальна версія (Health Check + Clean Async)

const HEALTH_MAX_AGE_MS = 15_000; // 15 секунд
let dictationTargetTabId = null;

function getCurrentMode() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ golosMode: "uk-clean" }, (result) => {
      resolve(result.golosMode || "uk-clean");
    });
  });
}

let lastHealth = {
  ok: null, // true / false / null
  reason: null, // "network", "backend-status-500", ...
  detail: null, // текст помилки або відповідь
  checkedAt: 0, // timestamp
};

// --- Функції перевірки здоров'я ---

async function runHealthCheck() {
  try {
    // Таймаут для health check, щоб не чекати вічно, якщо сервер завис
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 сек макс

    const res = await fetch("http://127.0.0.1:3000/health", {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      lastHealth = {
        ok: false,
        reason: `backend-status-${res.status}`,
        detail: null,
        checkedAt: Date.now(),
      };
      return lastHealth;
    }

    const data = await res.json();

    if (!data.ok) {
      lastHealth = {
        ok: false,
        reason: `backend-health-${data.stage || "unknown"}`,
        detail: data.error || data,
        checkedAt: Date.now(),
      };
      return lastHealth;
    }

    lastHealth = {
      ok: true,
      reason: "ok",
      detail: data,
      checkedAt: Date.now(),
    };
    return lastHealth;
  } catch (err) {
    lastHealth = {
      ok: false,
      reason: "network",
      detail: err.message || String(err),
      checkedAt: Date.now(),
    };
    return lastHealth;
  }
}

async function getHealthStatus({ force = false } = {}) {
  const now = Date.now();
  if (
    force ||
    !lastHealth.checkedAt ||
    now - lastHealth.checkedAt > HEALTH_MAX_AGE_MS
  ) {
    console.log("[Golos] Health cache expired or forced, checking...");
    return await runHealthCheck();
  }
  return lastHealth;
}

// --- Головна логіка (Alt+Shift+G) ---

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "golos-process-selection") return;

  console.log("[Golos] Command received:", command);

  try {
    // 1. Знаходимо активну вкладку
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      console.warn("[Golos] No active tab found");
      return;
    }

    // 2. Просимо текст у content-script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GOLOS_GET_TEXT",
    });

    if (!response?.text) {
      console.warn("[Golos] Empty or invalid response from page");
      return;
    }

    const originalText = response.text;
    console.log("[Golos] Captured:", originalText);

    // 3. Перевірка /health перед важким запитом
    const health = await getHealthStatus();

    if (!health.ok) {
      console.warn("[Golos] /health FAIL:", health);
      const fallback = `⚠ Голос: Сервер недоступний (${health.reason}).\nПеревірте, чи запущено golos-api.`;

      // Повертаємо повідомлення про помилку у сторінку
      await chrome.tabs.sendMessage(tab.id, {
        type: "GOLOS_SET_TEXT",
        text: originalText + "\n\n" + fallback,
      });
      return;
    }

    // 4. Якщо сервер живий — робимо /process
    let processedText = originalText;

    try {
      const res = await fetch("http://127.0.0.1:3000/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "uk-clean",
          text: originalText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.text) {
          processedText = data.text;
        }
      } else {
        console.warn("[Golos] /process returned non-OK:", res.status);
      }
    } catch (apiError) {
      console.warn("[Golos] /process fetch error:", apiError);
      processedText = originalText + "\n\n⚠ Голос: Помилка обробки (API Error)";
    }

    // 5. Вставляємо результат
    await chrome.tabs.sendMessage(tab.id, {
      type: "GOLOS_SET_TEXT",
      text: processedText,
    });

    console.log("[Golos] Done.");
  } catch (err) {
    // Цей блок ловить помилки зв'язку з content-script (наприклад, сторінка не оновлена)
    console.error("[Golos] Critical workflow error:", err);
  }
});

// --- Обробка повідомлень від Popup (GET_STATUS + Dictation) ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Запит статусу /health для popup
  if (message?.type === "GOLOS_GET_STATUS") {
    (async () => {
      const health = await getHealthStatus({ force: message.force === true });
      sendResponse(health);
    })();
    return true; // асинхронна відповідь
  }

  // Встановити цільову вкладку для диктування
  if (message?.type === "GOLOS_SET_DICTATION_TARGET") {
    if (typeof message.tabId === "number") {
      dictationTargetTabId = message.tabId;
      console.log("[Golos] Dictation target tab set to", dictationTargetTabId);
      sendResponse({ ok: true });
    } else {
      console.warn("[Golos] Invalid dictation target tabId", message.tabId);
      dictationTargetTabId = null;
      sendResponse({ ok: false, reason: "invalid-tab-id" });
    }
    return true;
  }

  // Запуск / зупинка диктування з панелі (dictation.html)
  if (
    message?.type === "GOLOS_START_DICTATION" ||
    message?.type === "GOLOS_STOP_DICTATION"
  ) {
    (async () => {
      try {
        const targetTabId = dictationTargetTabId;
        if (!targetTabId) {
          console.warn("[Golos] Dictation: no target tab set");
          sendResponse({ ok: false, reason: "no-target-tab" });
          return;
        }

        await chrome.tabs.sendMessage(targetTabId, {
          type: message.type,
        });

        sendResponse({ ok: true });
      } catch (err) {
        console.error("[Golos] Dictation forward error:", err);
        sendResponse({
          ok: false,
          reason: "forward-error",
          detail: err.message || String(err),
        });
      }
    })();

    return true;
  }
});

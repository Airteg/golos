import { MSG } from "../utils/messaging.js";

console.log("[Golos BG] Router v2.8 Robust Retry");

let engineTabId = null;
let isListening = false;

// --- 1. Керування вкладкою-двигуном ---

async function ensureEngineTab() {
  const engineUrl = chrome.runtime.getURL("engine/engine.html");
  try {
    const tabs = await chrome.tabs.query({ url: engineUrl });
    if (tabs.length > 0) {
      engineTabId = tabs[0].id;
      return engineTabId;
    }
    const newTab = await chrome.tabs.create({
      url: engineUrl,
      pinned: true,
      active: false,
    });
    engineTabId = newTab.id;
    return engineTabId;
  } catch (e) {
    console.error("[Golos BG] Engine error:", e);
    return null;
  }
}

// --- 2. Візуалізація стану ---

function setVisualState(state) {
  if (state === "listening") {
    isListening = true;
    chrome.action.setIcon({
      path: {
        16: "/assets/icons/icon-red-16.png",
        32: "/assets/icons/icon-red-32.png",
        48: "/assets/icons/icon-red-48.png",
        128: "/assets/icons/icon-red-128.png",
      },
    });
    chrome.action.setBadgeText({ text: "" });
  } else if (state === "idle") {
    isListening = false;
    chrome.action.setIcon({
      path: {
        16: "/assets/icons/icon-green-16.png",
        32: "/assets/icons/icon-green-32.png",
        48: "/assets/icons/icon-green-48.png",
        128: "/assets/icons/icon-green-128.png",
      },
    });
    chrome.action.setBadgeText({ text: "" });
  } else if (state === "error") {
    isListening = false;
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#000000" });
  }
}

// --- 3. Функція гарантованої доставки (Retry Logic) ---
async function sendMessageToEngineWithRetry(
  message,
  maxRetries = 10,
  interval = 300
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!engineTabId) throw new Error("No engine tab ID");

      // Пробуємо відправити
      const response = await chrome.tabs.sendMessage(engineTabId, message);
      return response; // Якщо успіх - повертаємо результат
    } catch (e) {
      console.warn(
        `[Golos BG] Engine not ready (attempt ${i + 1}/${maxRetries})...`
      );
      // Чекаємо перед наступною спробою
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  throw new Error("Engine tab failed to respond after retries");
}

// --- 4. Головний перемикач (Toggle) ---

async function toggleSession() {
  if (isListening) {
    // === STOP ===
    console.log("[Golos BG] Action: STOP");
    if (engineTabId) {
      // Тут ретрай не критичний, бо двигун вже працює
      chrome.tabs
        .sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION })
        .catch(() => {});
      setVisualState("idle");
    }
  } else {
    // === START ===
    console.log("[Golos BG] Action: START");

    // 1. Шукаємо активну вкладку
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id || activeTab.url.startsWith("chrome://")) {
      console.warn("Cannot dictate on this tab");
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
      return;
    }

    // 2. ПИТАЄМО сторінку
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: MSG.CMD_PING_WIDGET,
      });

      if (!response || !response.ok) {
        console.warn("[Golos BG] Page said NO.");
        chrome.action.setBadgeText({ text: "NO" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
        return;
      }
    } catch (err) {
      console.warn("[Golos BG] User needs to reload tab.", err);
      chrome.action.setBadgeText({ text: "↻" });
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
      return;
    }

    // 3. Запускаємо двигун
    const engId = await ensureEngineTab();
    if (!engId) return;

    // Ставимо візуал, що ми "в процесі"
    setVisualState("listening");

    // 🔥 ВІДПРАВЛЯЄМО КОМАНДУ З ПОВТОРАМИ (Fix для "глухого" старту)
    try {
      await sendMessageToEngineWithRetry({
        type: MSG.CMD_START_SESSION,
        targetTabId: activeTab.id,
      });
      console.log("[Golos BG] Engine started successfully.");
    } catch (error) {
      console.error("[Golos BG] Failed to start Engine:", error);
      setVisualState("error");
      setTimeout(() => setVisualState("idle"), 2000);
    }
  }
}

// --- 5. Listeners ---

chrome.action.onClicked.addListener((tab) => {
  toggleSession();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "golos-process-selection") {
    toggleSession();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Stop від віджета
  if (message.type === MSG.CMD_STOP_SESSION) {
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
      setVisualState("idle");
    }
  }

  // Транзит Engine <-> Content
  if (
    message.type === MSG.EVENT_TRANSCRIPT ||
    message.type === MSG.EVENT_STATE_CHANGE
  ) {
    if (message.type === MSG.EVENT_STATE_CHANGE) {
      if (message.state === "idle" || message.state === "error") {
        setVisualState("idle");
      }
    }
    const destTabId = message.targetTabId;
    if (destTabId) {
      chrome.tabs.sendMessage(destTabId, message).catch(() => {});
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  ensureEngineTab();
  chrome.contextMenus.create({
    id: "open-settings",
    title: "⚙️ Налаштування Golos",
    contexts: ["all"],
  });
  setVisualState("idle");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-settings") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (isListening) {
    console.log("[Golos BG] Tab changed. Auto-stopping session.");
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
    }
    setVisualState("idle");
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureEngineTab();
  setVisualState("idle");
});

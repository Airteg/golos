import { MSG } from "../utils/messaging.js";

// console.log("[Golos BG] Router v2.2 Clean UI");

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
    // 🔴 Стан ЗАПИСУ
    chrome.action.setIcon({
      path: {
        16: "/assets/icons/icon-red-16.png",
        32: "/assets/icons/icon-red-32.png",
        48: "/assets/icons/icon-red-48.png",
        128: "/assets/icons/icon-red-128.png",
      },
    });
    chrome.action.setBadgeText({ text: "" }); // Прибираємо текст
  } else if (state === "idle") {
    isListening = false;
    // 🟢 Стан СПОКОЮ
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
    // ⚠️ Помилка
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#000000" });
  }
}

// --- 3. Головний перемикач (Toggle) ---

async function toggleSession() {
  // Перевіряємо поточний стан
  if (isListening) {
    // === STOP ===
    console.log("[Golos BG] Action: STOP");
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
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

    // Перевірка на системні сторінки
    if (!activeTab || !activeTab.id || activeTab.url.startsWith("chrome://")) {
      console.warn("Cannot dictate on this tab");
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
      return;
    }

    // 2. ПИТАЄМО сторінку: "Чи є куди писати?"
    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: MSG.CMD_PING_WIDGET, // Використовуємо правильну константу
      });

      if (!response || !response.ok) {
        console.warn("[Golos BG] Page said NO (no input field).");
        chrome.action.setBadgeText({ text: "NO" });
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
        return;
      }
    } catch (err) {
      // ОБРОБКА ПОМИЛКИ "Receiving end does not exist"
      console.warn(
        "[Golos BG] Connection failed. User needs to reload tab.",
        err
      );

      // Візуальна підказка користувачу
      chrome.action.setBadgeText({ text: "↻" }); // Значок оновлення
      chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Жовтий

      // Скидаємо через 2 секунди
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
      return;
    }

    // 3. Запускаємо двигун
    ensureEngineTab().then((engId) => {
      if (!engId) return;

      // Ставимо статус ЗАРАЗ
      setVisualState("listening");

      chrome.tabs.sendMessage(engId, {
        type: MSG.CMD_START_SESSION,
        targetTabId: activeTab.id,
      });
    });
  }
}

// --- 4. Listeners ---

chrome.action.onClicked.addListener((tab) => {
  toggleSession();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "golos-process-selection") {
    toggleSession();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Якщо віджет просить зупинитись (хрестик)
  if (message.type === MSG.CMD_STOP_SESSION) {
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
      setVisualState("idle");
    }
  }

  // Транзит даних (Engine <-> Content)
  if (
    message.type === MSG.EVENT_TRANSCRIPT ||
    message.type === MSG.EVENT_STATE_CHANGE
  ) {
    // Синхронізація UI при авто-стопі
    if (message.type === MSG.EVENT_STATE_CHANGE) {
      if (message.state === "idle" || message.state === "error") {
        setVisualState("idle");
      }
    }
    // Пересилаємо повідомлення на цільову вкладку
    const destTabId = message.targetTabId;
    if (destTabId) {
      chrome.tabs.sendMessage(destTabId, message).catch(() => {});
    }
  }
});

// --- Контекстне меню ---
chrome.runtime.onInstalled.addListener(() => {
  ensureEngineTab();
  chrome.contextMenus.create({
    id: "open-settings",
    title: "⚙️ Налаштування Golos",
    contexts: ["all"],
  });
  setVisualState("idle"); // Скидаємо іконку при старті
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-settings") {
    chrome.runtime.openOptionsPage();
  }
});

// --- Авто-стоп при зміні вкладки ---
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

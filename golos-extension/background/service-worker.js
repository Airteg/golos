import { MSG } from "../utils/messaging.js";

console.log("[Golos BG] Router Started");

let engineTabId = null;

// 1. Функція створення Engine Tab
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

// 2. Універсальна функція перемикання (Toggle)
async function toggleSession(triggerSource) {
  console.log(`[Golos BG] Toggle requested via: ${triggerSource}`);

  // Перевіряємо статус по бейджу
  const badgeText = await chrome.action.getBadgeText({});
  const isRunning = badgeText === "ON";

  if (isRunning) {
    // --- STOP ---
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
      chrome.action.setBadgeText({ text: "" });
    }
  } else {
    // --- START ---
    // Знаходимо вкладку, де користувач хоче писати
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const activeTab = tabs[0];

    if (activeTab?.id) {
      // Показуємо віджет
      chrome.tabs
        .sendMessage(activeTab.id, { type: "CMD_ShowWidget" })
        .catch(() => {
          console.warn("Could not show widget. Need refresh?");
        });

      // Запускаємо двигун
      ensureEngineTab().then((engId) => {
        if (!engId) return;
        chrome.tabs.sendMessage(engId, {
          type: MSG.CMD_START_SESSION,
          targetTabId: activeTab.id,
        });
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      });
    } else {
      console.warn("[Golos BG] No active tab found to dictate to.");
    }
  }
}

// 3. Ініціалізація
chrome.runtime.onInstalled.addListener(() => ensureEngineTab());
chrome.runtime.onStartup.addListener(() => ensureEngineTab());

// 4. Обробка повідомлень
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // А. Клік по кнопці в Popup (НОВЕ!)
  if (message.type === "CMD_POPUP_TOGGLE") {
    toggleSession("Popup Button");
  }

  // Б. Прямі команди від віджета (хрестик)
  if (message.type === MSG.CMD_STOP_SESSION) {
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
      chrome.action.setBadgeText({ text: "" });
    }
  }

  // В. Транзит даних (Engine <-> Content)
  if (
    message.type === MSG.EVENT_TRANSCRIPT ||
    message.type === MSG.EVENT_STATE_CHANGE
  ) {
    if (message.type === MSG.EVENT_STATE_CHANGE) {
      // Синхронізація бейджа при авто-стопі
      if (message.state === "idle" || message.state === "error") {
        chrome.action.setBadgeText({ text: "" });
      } else if (message.state === "listening") {
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
      }
    }

    const destTabId = message.targetTabId;
    if (destTabId) {
      chrome.tabs.sendMessage(destTabId, message).catch(() => {});
    }
  }
});

// 5. Гаряча клавіша
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "golos-process-selection") {
    toggleSession("Shortcut");
  }
});

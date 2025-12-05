import { MSG } from "../utils/messaging.js";

console.log("[Golos BG] Router v2.0 Started");

let engineTabId = null;

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

// --- 2. Візуалізація стану (Іконка + Badge) ---

function setVisualState(state) {
  // state: 'idle' | 'listening' | 'error'

  if (state === "listening") {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    // Якщо у тебе будуть іконки:
    // chrome.action.setIcon({ path: "assets/icon-red.png" });
  } else {
    chrome.action.setBadgeText({ text: "" }); // Прибираємо текст
    // chrome.action.setIcon({ path: "assets/icon-gray.png" });
  }
}

// --- 3. Головний перемикач (Toggle) ---

async function toggleSession() {
  // Перевіряємо статус по бейджу (це наше джерело правди)
  const badgeText = await chrome.action.getBadgeText({});
  const isRunning = badgeText === "ON";

  if (isRunning) {
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
        type: "CMD_ShowWidget",
      });

      // Якщо сторінка сказала "Ні" (ok: false) або не відповіла
      if (!response || !response.ok) {
        console.warn("[Golos BG] Page said NO (no input field).");
        chrome.action.setBadgeText({ text: "NO" }); // Показуємо NO
        setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
        return; // ПРИПИНЯЄМО РОБОТУ, двигун не запускаємо!
      }
    } catch (err) {
      console.warn("[Golos BG] Content script not ready or error:", err);
      return;
    }

    // 3. Якщо дійшли сюди - значить все ОК, запускаємо двигун
    ensureEngineTab().then((engId) => {
      if (!engId) return;
      chrome.tabs.sendMessage(engId, {
        type: MSG.CMD_START_SESSION,
        targetTabId: activeTab.id,
      });
      setVisualState("listening");
    });
  }
}

// --- 4. Listeners ---

// Клік по іконці (ЛКМ)
chrome.action.onClicked.addListener((tab) => {
  toggleSession();
});

// Гаряча клавіша
chrome.commands.onCommand.addListener((command) => {
  if (command === "golos-process-selection") {
    toggleSession();
  }
});

// Слухач повідомлень
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
      setVisualState(message.state);
    }

    const destTabId = message.targetTabId;
    if (destTabId) {
      chrome.tabs.sendMessage(destTabId, message).catch(() => {});
    }
  }
});

// Старт
chrome.runtime.onInstalled.addListener(() => ensureEngineTab());
chrome.runtime.onStartup.addListener(() => ensureEngineTab());

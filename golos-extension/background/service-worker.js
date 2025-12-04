import { MSG } from "../utils/messaging.js";

console.log("[Golos BG] Router Started");

let engineTabId = null;

// 1. Функція створення/пошуку Engine Tab
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

// 2. Ініціалізація
chrome.runtime.onInstalled.addListener(() => ensureEngineTab());
chrome.runtime.onStartup.addListener(() => ensureEngineTab());

// 3. Маршрутизатор повідомлень (Router)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // А. Повідомлення від Сайту (Content Script) -> до Двигуна
  if (message.type === MSG.CMD_START_SESSION) {
    console.log("[Golos BG] Session Start Request from tab:", sender.tab.id);

    ensureEngineTab().then((engId) => {
      if (!engId) return;
      // Пересилаємо команду в Engine, додаючи ID вкладки, куди потім слати текст
      chrome.tabs.sendMessage(engId, {
        type: MSG.CMD_START_SESSION,
        targetTabId: sender.tab.id,
      });

      // Змінюємо іконку на "ON"
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    });
  }

  if (message.type === MSG.CMD_STOP_SESSION) {
    if (engineTabId) {
      chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
      chrome.action.setBadgeText({ text: "" });
    }
  }

  // Б. Повідомлення від Двигуна -> до Сайту
  if (
    message.type === MSG.EVENT_TRANSCRIPT ||
    message.type === MSG.EVENT_STATE_CHANGE
  ) {
    // Двигун має повернути targetTabId, щоб ми знали, кому віддати текст
    const destTabId = message.targetTabId;
    if (destTabId) {
      chrome.tabs.sendMessage(destTabId, message).catch(() => {
        console.warn("[Golos BG] Target tab gone?");
      });
    }
  }
});

// 4. Гаряча клавіша (Trigger Toggle)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "golos-process-selection") {
    // Перевіряємо, чи ми зараз диктуємо, по тексту на іконці ("ON")
    const badgeText = await chrome.action.getBadgeText({});
    const isRunning = badgeText === "ON";

    if (isRunning) {
      // ЯКЩО ПРАЦЮЄ -> СТОП
      console.log("[Golos BG] Toggle: STOP");
      if (engineTabId) {
        chrome.tabs.sendMessage(engineTabId, { type: MSG.CMD_STOP_SESSION });
        chrome.action.setBadgeText({ text: "" });
      }
    } else {
      // ЯКЩО НЕ ПРАЦЮЄ -> СТАРТ
      console.log("[Golos BG] Toggle: START");
      const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: "CMD_ShowWidget" });

        ensureEngineTab().then((engId) => {
          chrome.tabs.sendMessage(engId, {
            type: MSG.CMD_START_SESSION,
            targetTabId: activeTab.id,
          });
          chrome.action.setBadgeText({ text: "ON" });
          chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
        });
      }
    }
  }
});

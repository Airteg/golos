import { MSG } from "../utils/messaging.js";

console.log(
  "%c[Golos Background] Started module-based worker",
  "color: springgreen;"
);
let engineTabId = null;

async function ensureEngineTab() {
  const engineUrl = chrome.runtime.getURL("engine/engine.html");

  try {
    // 1. Шукаємо вкладку
    const tabs = await chrome.tabs.query({ url: engineUrl });
    if (tabs.length > 0) {
      engineTabId = tabs[0].id;
      console.log(`[Golos] Found existing Engine at tab ${engineTabId}`);
      return engineTabId;
    }

    // 2. Створюємо нову
    const newTab = await chrome.tabs.create({
      url: engineUrl,
      pinned: true,
      active: false,
    });
    engineTabId = newTab.id;
    console.log(`[Golos] Created new Engine at tab ${engineTabId}`);
    return engineTabId;
  } catch (e) {
    console.error("[Golos] Engine creation failed:", e);
  }
}

// Запускаємо двигун при старті
chrome.runtime.onInstalled.addListener(() => ensureEngineTab());
chrome.runtime.onStartup.addListener(() => ensureEngineTab());

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "golos-process-selection") {
    console.log("%c[Golos BG] Shortcut pressed", "color: green;");

    // 1. Переконуємось, що двигун живий
    await ensureEngineTab();

    // 2. Шукаємо активну вкладку, де користувач натиснув кнопки
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const activeTab = tabs[0];

    if (activeTab?.id) {
      // 3. Кажемо цій вкладці: "Покажи віджет!"
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: "CMD_ShowWidget" });
      } catch (err) {
        console.warn("[Golos BG] Content script not ready?", err);
      }
    }
  }
});

import { MSG } from "../utils/messaging.js";

console.log("[Golos BG] Router v3.1 Debounced Audio");

let engineTabId = null;
let isListening = false;
let creatingOffscreen = false;

let lastOffTime = 0;

async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;

  if (creatingOffscreen) return;
  creatingOffscreen = true;

  await chrome.offscreen.createDocument({
    url: path,
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Notification sounds for voice dictation",
  });
  creatingOffscreen = false;
}

async function playSound(filename) {
  try {
    await setupOffscreenDocument("background/offscreen.html");
    chrome.runtime.sendMessage({
      type: "SFX_PLAY",
      path: `assets/sounds/${filename}`,
      volume: 0.6,
    });
  } catch (e) {
    console.error("[Golos BG] Audio failed:", e);
  }
}

function playOff() {
  const now = Date.now();

  if (now - lastOffTime < 500) {
    console.log("[Golos BG] Skipped duplicate OFF sound");
    return;
  }
  lastOffTime = now;
  playSound("off.mp3");
}

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

function setVisualState(state) {
  if (state === "listening") {
    isListening = true;
    chrome.action.setIcon({
      path: {
        16: "/assets/icons/icon-red-16.png",
        32: "/assets/icons/icon-red-32.png",
      },
    });
    chrome.action.setBadgeText({ text: "" });
  } else if (state === "idle") {
    isListening = false;
    chrome.action.setIcon({
      path: {
        16: "/assets/icons/icon-green-16.png",
        32: "/assets/icons/icon-green-32.png",
      },
    });
    chrome.action.setBadgeText({ text: "" });
  } else if (state === "error") {
    isListening = false;
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#000000" });
  }
}

async function sendMessageToEngineWithRetry(
  message,
  maxRetries = 10,
  interval = 300
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!engineTabId) throw new Error("No engine tab ID");
      const response = await chrome.tabs.sendMessage(engineTabId, message);
      return response;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  throw new Error(`Engine failed to respond to ${message.type}`);
}

async function toggleSession() {
  setupOffscreenDocument("background/offscreen.html");

  if (isListening) {
    console.log("[Golos BG] Action: STOP");

    playOff();
    if (engineTabId) {
      sendMessageToEngineWithRetry(
        { type: MSG.CMD_STOP_SESSION },
        5,
        200
      ).catch(() => {});
    }
    setVisualState("idle");
  } else {
    // === START ===
    console.log("[Golos BG] Action: START");

    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const activeTab = tabs[0];

    if (!activeTab || !activeTab.id || activeTab.url.startsWith("chrome://")) {
      chrome.action.setBadgeText({ text: "ERR" });
      setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: MSG.CMD_PING_WIDGET,
      });
      if (!response || !response.ok) {
        chrome.action.setBadgeText({ text: "NO" });
        return;
      }
    } catch (err) {
      chrome.action.setBadgeText({ text: "↻" });
      return;
    }

    const engId = await ensureEngineTab();
    if (!engId) return;

    setVisualState("listening");

    playSound("on.mp3");
    sendMessageToEngineWithRetry(
      {
        type: MSG.CMD_START_SESSION,
        targetTabId: activeTab.id,
      },
      10,
      300
    ).catch((e) => {
      console.error("Start failed", e);
      setVisualState("error");
    });
  }
}

chrome.action.onClicked.addListener(toggleSession);
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "golos-process-selection") toggleSession();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.CMD_STOP_SESSION) {
    if (isListening) {
      playOff();
      if (engineTabId)
        sendMessageToEngineWithRetry(
          { type: MSG.CMD_STOP_SESSION },
          5,
          200
        ).catch(() => {});
      setVisualState("idle");
    }
  }

  if (
    message.type === MSG.EVENT_TRANSCRIPT ||
    message.type === MSG.EVENT_STATE_CHANGE
  ) {
    if (message.type === MSG.EVENT_STATE_CHANGE) {
      if (message.state === "idle" && isListening) {
        playOff();
        setVisualState("idle");
      }
      if (message.state === "error") {
        playSound("error.mp3");
        setVisualState("error");
      }
    }
    if (message.targetTabId) {
      chrome.tabs.sendMessage(message.targetTabId, message).catch(() => {});
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

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-settings") chrome.runtime.openOptionsPage();
});

chrome.tabs.onActivated.addListener(async () => {
  if (isListening) {
    console.log("[Golos BG] Tab changed. Auto-stopping.");
    playOff();
    if (engineTabId)
      sendMessageToEngineWithRetry(
        { type: MSG.CMD_STOP_SESSION },
        5,
        200
      ).catch(() => {});
    setVisualState("idle");
  }
});

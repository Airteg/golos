import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Lite Version (No Audio)");

let recognition = null;
let currentTargetTabId = null;
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;
let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000;

const MACROS = {
  кома: ",",
  крапка: ".",
  "знак питання": "?",
  "знак оклику": "!",
  дефіс: "-",
  двокрапка: ":",
  тире: " —",
  "новий рядок": "\n",
  абзац: "\n\n",
  "дужка відкривається": "(",
  "дужка закривається": ")",
  смайлик: "🙂",
};

function applyMacros(text) {
  if (!text) return text;
  let processed = text;
  for (const [key, value] of Object.entries(MACROS)) {
    const regex = new RegExp(`(^|\\s)${key}(?=$|\\s|[.,?!])`, "gi");
    processed = processed.replace(regex, (match, prefix) => {
      if ([".", ",", "?", "!", ":", ")"].includes(value)) return value;
      return prefix + value;
    });
  }
  processed = processed
    .replace(/\s+([.,?!:);])/g, "$1")
    .replace(/(\()\s+/g, "$1")
    .replace(/([.,?!:;])(?=[^\s])/g, "$1 ");
  return processed;
}

async function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const { golosLang } = await chrome.storage.sync.get({ golosLang: "uk-UA" });
  console.log(`[Golos Engine] Lang: ${golosLang}`);

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = golosLang;

  rec.onstart = () => {
    console.log("[Golos Engine] ON");
    sendState("listening");
    resetSilenceTimer();
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  };

  rec.onend = () => {
    console.log("[Golos Engine] OFF");
    sendState("idle");
    clearTimeout(silenceTimer);
    shutdownTimer = setTimeout(() => window.close(), SHUTDOWN_TIMEOUT_MS);
  };

  rec.onresult = (event) => {
    resetSilenceTimer();
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (final) {
      final = applyMacros(final);
      final = final.charAt(0).toUpperCase() + final.slice(1);
    }
    if (currentTargetTabId) {
      chrome.runtime.sendMessage({
        type: MSG.EVENT_TRANSCRIPT,
        text: final || interim,
        isFinal: !!final,
        targetTabId: currentTargetTabId,
      });
    }
  };

  rec.onerror = (e) => {
    if (e.error !== "no-speech") {
      sendState("error");
    }
  };
  return rec;
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    console.log("[Golos Engine] Silence timeout");
    stopSession();
  }, SILENCE_TIMEOUT_MS);
}

function stopSession() {
  if (recognition) recognition.stop();
}

function sendState(state) {
  if (currentTargetTabId) {
    chrome.runtime.sendMessage({
      type: MSG.EVENT_STATE_CHANGE,
      state: state,
      targetTabId: currentTargetTabId,
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.CMD_START_SESSION) {
    currentTargetTabId = message.targetTabId;
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
    if (recognition) recognition.abort();

    initRecognition().then((rec) => {
      recognition = rec;
      try {
        recognition.start();
        sendResponse({ started: true });
      } catch (e) {
        sendResponse({ started: false, error: e.message });
      }
    });
    return true;
  }

  if (message.type === MSG.CMD_STOP_SESSION) {
    stopSession();
    sendResponse({ stopped: true });
  }
});

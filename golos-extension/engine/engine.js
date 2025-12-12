import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Ready to listen.");

let recognition = null;
let currentTargetTabId = null;

// Таймер тиші
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;

// Таймер самознищення вкладки
let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000; // 90 секунд

// --- СЛОВНИК МАКРОСІВ ---
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

  // 1. Заміна слів на символи
  for (const [key, value] of Object.entries(MACROS)) {
    const regex = new RegExp(`(^|\\s)${key}(?=$|\\s|[.,?!])`, "gi");
    processed = processed.replace(regex, (match, prefix) => {
      if ([".", ",", "?", "!", ":", ")"].includes(value)) {
        return value;
      }
      return prefix + value;
    });
  }

  // 2. Чистка пробілів
  processed = processed.replace(/\s+([.,?!:);])/g, "$1");
  processed = processed.replace(/(\()\s+/g, "$1");
  processed = processed.replace(/([.,?!:;])(?=[^\s])/g, "$1 ");

  return processed;
}

// --- ІНІЦІАЛІЗАЦІЯ РОЗПІЗНАВАННЯ ---
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

    // Якщо почали говорити - скасовуємо закриття вкладки
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  };

  rec.onend = () => {
    console.log("[Golos Engine] OFF");

    sendState("idle");
    clearTimeout(silenceTimer);

    // Запускаємо таймер закриття вкладки
    console.log(
      `[Golos Engine] Closing tab in ${
        SHUTDOWN_TIMEOUT_MS / 1000
      }s if inactive...`
    );
    shutdownTimer = setTimeout(() => {
      console.log("[Golos Engine] Auto-closing tab.");
      window.close();
    }, SHUTDOWN_TIMEOUT_MS);
  };

  rec.onresult = (event) => {
    resetSilenceTimer();

    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        final += res[0].transcript;
      } else {
        interim += res[0].transcript;
      }
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
    if (e.error !== "no-speech") sendState("error");
  };
  return rec;
}

// --- ТАЙМЕР БЕЗДІЯЛЬНОСТІ ---
function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    console.log("[Golos Engine] Silence stop.");
    stopSession();
  }, SILENCE_TIMEOUT_MS);
}

// --- ЗУПИНКА СЕСІЇ ---
function stopSession() {
  if (recognition) recognition.stop();
  updateStatusUI("Idle");
}

// --- ВІДПРАВКА СТАНУ ---
function sendState(state) {
  if (currentTargetTabId) {
    chrome.runtime.sendMessage({
      type: MSG.EVENT_STATE_CHANGE,
      state: state,
      targetTabId: currentTargetTabId,
    });
  }
}

// --- ОБРОБКА ПОВІДОМЛЕНЬ ---
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.CMD_START_SESSION) {
    currentTargetTabId = message.targetTabId;

    // При ручному старті теж скасовуємо закриття
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }

    if (recognition) recognition.abort();
    initRecognition().then((rec) => {
      recognition = rec;
      try {
        recognition.start();
        updateStatusUI(`Listening ${currentTargetTabId}`);
      } catch (e) {}
    });
    return true;
  }
  if (message.type === MSG.CMD_STOP_SESSION) stopSession();
});

function updateStatusUI(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

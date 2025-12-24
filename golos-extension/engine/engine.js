import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Lite Version (No Audio)");

let recognition = null;
let currentTargetTabId = null;
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;
let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000;

// Оновлений список макросів
const MACROS = {
  // Пунктуація
  кома: ",",
  крапка: ".",
  "знак питання": "?",
  "знак оклику": "!",
  дефіс: "-",
  двокрапка: ":",
  тире: " —", // довге тире з пробілом перед ним
  "новий рядок": "\n",
  абзац: "\n\n",
  "дужка відкривається": "(",
  "дужка закривається": ")",
  "точка з комою": ";",

  // Спецсимволи
  смайлик: "🙂",
  амперсанд: "&",
  "зворотна коса риска": "\\", // Екранування для JS
  "коса риска": "/",
  "центрована точка": "·",
  "знак градуса": "°",
  "нижнє підкреслення": "_",
  "вертикальна риска": "|",

  // Валюти (експериментально, без обробки пробілів)
  долар: "$",
  "знак долара": "$",
  євро: "€",
  "знак євро": "€",
  фунт: "£",
  "знак фунта": "£",
  гривня: "₴",
  "знак гривні": "₴",
};

function applyMacros(text) {
  if (!text) return text;
  let processed = text;

  // 1. Заміна слів на символи
  for (const [key, value] of Object.entries(MACROS)) {
    // Шукаємо точний збіг слова, щоб не замінювати частини слів
    // (^|\s) - початок рядка або пробіл
    // (?=$|\s|[.,?!]) - кінець рядка, пробіл або розділовий знак
    const regex = new RegExp(`(^|\\s)${key}(?=$|\\s|[.,?!])`, "gi");

    processed = processed.replace(regex, (match, prefix) => {
      // Якщо це спецсимвол, який ми не хочемо склеювати з попереднім словом (поки що),
      // просто повертаємо його.
      // Для звичайної пунктуації (.,?!:) ми поки лишаємо як є.
      return prefix + value;
    });
  }

  // 2. Чистка пробілів
  processed = processed
    // Видаляємо пробіл перед розділовими знаками
    .replace(/\s+([.,?!:);])/g, "$1")
    // Видаляємо пробіл після відкриваючої дужки
    .replace(/(\()\s+/g, "$1");
  // Додаємо пробіл після розділових знаків, якщо його немає
  // .replace(/([.,?!:;])(?=[^\s])/g, "$1 ");

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
      if (res.isFinal) {
        final += res[0].transcript;
        // DEBUG: Дивимось, що приходить від Chrome для валют
        console.log(`[RAW FINAL]: '${res[0].transcript}'`);
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

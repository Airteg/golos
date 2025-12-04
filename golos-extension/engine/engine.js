import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Ready to listen.");

let recognition = null;
let currentTargetTabId = null;
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20500;

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

  // Проходимось по всіх ключах і замінюємо (нечутливо до регістру)
  // Використовуємо регулярку для заміни окремих слів
  let processed = text;

  for (const [key, value] of Object.entries(MACROS)) {
    // Шукаємо слово, перед яким може бути пробіл, і після якого може бути пробіл
    // Прапор 'gi' = global + case-insensitive
    const regex = new RegExp(`(^|\\s)${key}(?=$|\\s|[.,?!])`, "gi");
    processed = processed.replace(regex, (match, prefix) => {
      // Якщо це просто символ (.,?), прибираємо зайвий пробіл перед ним
      if ([".", ",", "?", "!", ":", ")"].includes(value)) {
        return value;
      }
      // Для інших (смайлик, дужка відкривається) залишаємо префікс (пробіл)
      return prefix + value;
    });
  }

  // Додаткова чистка: прибрати пробіли перед знаками пунктуації, якщо вони залишились
  processed = processed.replace(/\s+([.,?!:])/g, "$1");

  return processed;
}

// ... initRecognition ...
async function initRecognition() {
  // ... (початок такий самий) ...
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
  };

  rec.onend = () => {
    console.log("[Golos Engine] OFF");
    sendState("idle");
    clearTimeout(silenceTimer);
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

    // ЗАСТОСОВУЄМО МАКРОСИ ТІЛЬКИ ДО ФІНАЛЬНОГО ТЕКСТУ
    // (щоб під час диктування ти бачив слова "кома", а в кінці вони ставали ",")
    if (final) {
      final = applyMacros(final);
      // Капіталізація першої літери (бо макроси могли змінити структуру)
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

  // ... onerror та інше без змін ...
  rec.onerror = (e) => {
    if (e.error !== "no-speech") sendState("error");
  };
  return rec;
}

// ... решта файлу (resetSilenceTimer, sendState, onMessage) без змін ...
function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    console.log("[Golos Engine] Silence stop.");
    stopSession();
  }, SILENCE_TIMEOUT_MS);
}

function stopSession() {
  if (recognition) recognition.stop();
  updateStatusUI("Idle");
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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.CMD_START_SESSION) {
    currentTargetTabId = message.targetTabId;
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

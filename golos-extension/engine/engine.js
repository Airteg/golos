import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Smart Context v2.0");

let recognition = null;
let currentTargetTabId = null;
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;
let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000;

// Стан контексту
let ctx = {
  isNewSentence: true, // Чи початок нового речення?
  hasTrailingSpace: false, // Чи закінчився попередній чанк пробілом?
};

const MACROS = {
  // Пунктуація
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
  "точка з комою": ";",

  // Спецсимволи
  смайлик: "🙂",
  амперсанд: "&",
  "зворотна коса риска": "\\",
  "коса риска": "/",
  "центрована точка": "·",
  "знак градуса": "°",
  "нижнє підкреслення": "_",
  "вертикальна риска": "|",

  // Валюти (Regex-ready roots)
  долар: "$",
  євро: "€",
  фунт: "£",
  гривн: "₴", // Корінь для гривня, гривні, гривень
};

// Функція для "розумної" капіталізації
function smartCapitalize(text, forceCap) {
  if (!text) return text;

  // Знаходимо першу літеру (пропускаючи пробіли та символи)
  // Це виправить проблему, коли пробіл ставав UpperCase
  return text.replace(/^(\s*)([a-zа-яіїєґ])/i, (match, space, char) => {
    return space + (forceCap ? char.toUpperCase() : char);
  });
}

function applyMacros(text) {
  if (!text) return text;
  let processed = text;

  // 1. Макроси
  for (const [key, value] of Object.entries(MACROS)) {
    // Покращений Regex: шукає корінь слова + можливі закінчення (для валют)
    // Наприклад "гривн" зловить "гривня", "гривні", "гривень"
    const regex = new RegExp(`(^|\\s)${key}[а-яіїєґ]*(?=$|\\s|[.,?!])`, "gi");
    processed = processed.replace(regex, (match, prefix) => prefix + value);
  }

  // 2. Чистка пунктуації (видалення пробілів перед знаками)
  processed = processed
    .replace(/\s+([.,?!:);])/g, "$1")
    .replace(/(\()\s+/g, "$1");

  return processed;
}

async function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const { golosLang } = await chrome.storage.sync.get({ golosLang: "uk-UA" });

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = golosLang;

  rec.onstart = () => {
    console.log("[Golos Engine] ON");
    ctx.isNewSentence = true; // Скидаємо контекст при старті
    ctx.hasTrailingSpace = false;
    sendState("listening");
    resetSilenceTimer();
    if (shutdownTimer) clearTimeout(shutdownTimer);
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
      } else {
        interim += res[0].transcript;
      }
    }

    if (final) {
      // 1. Зберігаємо оригінальні пробіли від Chrome для аналізу
      const rawFinal = final;

      // 2. Застосовуємо макроси
      final = applyMacros(final);

      // 3. Логіка капіталізації
      // Якщо це початок нового речення - робимо велику літеру
      if (ctx.isNewSentence) {
        final = smartCapitalize(final, true);
      } else {
        // Якщо це середина речення, Chrome може все одно дати велику літеру
        // Можна примусово зменшити, але обережно (власні назви)
        // Поки що лишаємо як є, або можна зробити smartCapitalize(final, false)
      }

      // 4. Оновлюємо контекст для наступного чанка
      const trimmed = final.trim();
      if (trimmed.length > 0) {
        const lastChar = trimmed.slice(-1);
        // Якщо закінчується на . ? ! — наступний чанк буде з великої
        if ([".", "?", "!", "\n"].includes(lastChar)) {
          ctx.isNewSentence = true;
        } else {
          ctx.isNewSentence = false;
        }
      }

      // Відправляємо
      if (currentTargetTabId) {
        chrome.runtime.sendMessage({
          type: MSG.EVENT_TRANSCRIPT,
          text: final,
          isFinal: true,
          targetTabId: currentTargetTabId,
        });
      }
    } else if (interim) {
      // Для interim просто шлемо як є
      chrome.runtime.sendMessage({
        type: MSG.EVENT_TRANSCRIPT,
        text: interim,
        isFinal: false,
        targetTabId: currentTargetTabId,
      });
    }
  };

  rec.onerror = (e) => {
    if (e.error !== "no-speech") sendState("error");
  };
  return rec;
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => stopSession(), SILENCE_TIMEOUT_MS);
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
    if (shutdownTimer) clearTimeout(shutdownTimer);
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

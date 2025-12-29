import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Smart Context v3.6 (Release Candidate)");

let recognition = null;
let currentTargetTabId = null;

let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;

let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000;

// Контекст
let ctx = {
  isNewSentence: true,
};

const MACROS = {
  // --- Пунктуація ---
  "крапка з комою": ";",
  "знак питання": "?",
  "знак оклику": "!",
  двокрапка: ":",
  кома: ",",
  крапка: ".",
  дефіс: "-",
  тире: " —", // (з пробілом)

  "новий рядок": "\n",
  абзац: "\n\n",

  "дужка відкривається": "(",
  "дужка закривається": ")",

  // Лапки
  лапки: '"',
  "відкрити лапки": "«",
  "закрити лапки": "»",

  // --- Спецсимволи ---
  смайлик: "🙂",
  амперсанд: "&",
  "зворотна коса риска": "\\",
  "коса риска": "/",
  "центрована точка": "·",
  "знак градуса": "°",
  "нижнє підкреслення": "_",
  "вертикальна риска": "|",

  // --- Валюти ---
  долар: "$",
  євро: "€",
  фунт: "£",
  гривн: "₴", // Корінь для відмінювання
  // "грн" прибрано, бо є спец-кейс нижче
};

// Суфікси (закінчення) дозволені тільки тут
const ROOTS_WITH_SUFFIX = new Set(["гривн", "долар", "фунт"]);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 1. Капіталізація першої літери
function smartCapitalize(text, forceCap) {
  if (!text) return text;
  return text.replace(/^([^\p{L}]*)([\p{L}])/iu, (m, prefix, ch) => {
    return prefix + (forceCap ? ch.toUpperCase() : ch);
  });
}

// 2. Капіталізація всередині тексту після знаків
function capitalizeAfterPunct(text) {
  if (!text) return text;
  return text.replace(
    /([.?!\n]\s*[«„“"'\(\[\{]*)([\p{L}])/gu,
    (m, prefix, ch) => {
      return prefix + ch.toUpperCase();
    }
  );
}

function applyMacros(text) {
  if (!text) return text;
  let processed = text;

  // --- 0. Спец-кейси ---
  // "грн" або "грн." -> ₴
  processed = processed.replace(/(^|[^\p{L}])грн\.?(?=$|[^\p{L}])/giu, "$1₴");

  // --- 1. Основна заміна макросів ---
  // Визначення символів, що складають "слово" (літери + діакритика + апострофи)
  // Без дужок [], бо ми їх додаємо при побудові RegExp
  const WORD_CHARS = "\\p{L}\\p{M}’'";

  const keys = Object.keys(MACROS).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const value = MACROS[key];
    const escapedKey = escapeRegExp(key);
    const allowSuffix = ROOTS_WITH_SUFFIX.has(key);

    // Клас допустимих суфіксів: [chars]*
    const suffixPattern = allowSuffix ? `[${WORD_CHARS}]*` : "";

    // Regex:
    // (^|[^chars]) -> Початок або НЕ-слово
    // (key)
    // suffix
    // (?=$|[^chars]) -> Кінець або НЕ-слово
    const re = new RegExp(
      `(^|[^${WORD_CHARS}])(${escapedKey})${suffixPattern}(?=$|[^${WORD_CHARS}])`,
      "giu"
    );

    processed = processed.replace(re, (match, prefix) => prefix + value);
  }

  // --- 2. Тире-фікс ---
  processed = processed.replace(/\s+—/gu, " —");
  processed = processed.replace(/—\s*-\s*/gu, "— ");

  // --- 3. Чистка пунктуації ---
  processed = processed
    .replace(/\s+([.,?!:;)\]}»”"…])/gu, "$1")
    .replace(/([(\[{«„“"'])\s+/gu, "$1")
    .replace(/([!?;])(?=[\p{L}\p{N}])/gu, "$1 ")
    .replace(/([.,:])(?=[\p{L}])/gu, "$1 ");

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
    ctx.isNewSentence = true;
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
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }

    if (final) {
      // 0) Нормалізація входу
      // НЕ trim(), інакше слова злипаються між чанками ("Сьогоднія")
      // Замінюємо будь-яку кількість пробілів на початку на один
      final = final.replace(/^\s+/u, " ");

      // Прибираємо маркер списку "- " на старті чанка (часта проблема Chrome)
      final = final.replace(/^\s*-\s+/u, "");

      console.log(`[RAW]: '${final}'`);

      final = applyMacros(final);
      final = capitalizeAfterPunct(final);

      if (ctx.isNewSentence) {
        final = smartCapitalize(final, true);
      }

      // 4. Оновлення контексту
      // Для перевірки кінця речення trim() безпечний, бо ми перевіряємо тільки останній символ
      const trimmed = final.trim();
      if (trimmed.length > 0) {
        const lastChar = trimmed.slice(-1);
        ctx.isNewSentence = [".", "?", "!", "\n"].includes(lastChar);
      }

      if (currentTargetTabId) {
        chrome.runtime.sendMessage({
          type: MSG.EVENT_TRANSCRIPT,
          text: final,
          isFinal: true,
          targetTabId: currentTargetTabId,
        });
      }
    } else if (interim) {
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
  if (!currentTargetTabId) return;
  chrome.runtime.sendMessage({
    type: MSG.EVENT_STATE_CHANGE,
    state,
    targetTabId: currentTargetTabId,
  });
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

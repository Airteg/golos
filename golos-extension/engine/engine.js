import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Ready v2.8 Robust Audio");

// --- АУДІО СИСТЕМА (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const soundBuffers = {};

async function loadSound(name, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    soundBuffers[name] = audioBuffer;
    console.log(`[Golos Engine] Buffer loaded: ${name}`);
  } catch (e) {
    console.error(`[Golos Engine] Failed to load ${name} (${url}):`, e);
  }
}

// 🔥 Promise, який гарантує, що звуки готові
const soundsReadyPromise = Promise.all([
  loadSound("start", chrome.runtime.getURL("assets/sounds/on.mp3")),
  loadSound("end", chrome.runtime.getURL("assets/sounds/off.mp3")),
  loadSound("error", chrome.runtime.getURL("assets/sounds/error.mp3")),
]);

async function playSound(type) {
  // Чекаємо завантаження перед програванням
  await soundsReadyPromise;

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const buffer = soundBuffers[type];
  if (buffer) {
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  }
}

// --- ГОЛОВНА ЛОГІКА ---

let recognition = null;
let currentTargetTabId = null;
let silenceTimer = null;
const SILENCE_TIMEOUT_MS = 20000;
let shutdownTimer = null;
const SHUTDOWN_TIMEOUT_MS = 90000;

// Прапорець, щоб уникнути подвійного звуку
let isManuallyStopped = false;

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
  processed = processed.replace(/\s+([.,?!:);])/g, "$1");
  processed = processed.replace(/(\()\s+/g, "$1");
  processed = processed.replace(/([.,?!:;])(?=[^\s])/g, "$1 ");
  return processed;
}

async function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  // Чекаємо звуки перед ініціалізацією
  await soundsReadyPromise;

  const { golosLang } = await chrome.storage.sync.get({ golosLang: "uk-UA" });
  console.log(`[Golos Engine] Lang: ${golosLang}`);

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = golosLang;

  rec.onstart = () => {
    console.log("[Golos Engine] ON");
    isManuallyStopped = false;
    playSound("start");
    sendState("listening");
    resetSilenceTimer();
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  };

  rec.onend = () => {
    console.log("[Golos Engine] OFF (onend)");

    if (!isManuallyStopped) {
      playSound("end");
    }
    isManuallyStopped = false;

    sendState("idle");
    clearTimeout(silenceTimer);
    shutdownTimer = setTimeout(() => {
      window.close();
    }, SHUTDOWN_TIMEOUT_MS);
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
      playSound("error");
    }
  };
  return rec;
}

function resetSilenceTimer() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    console.log("[Golos Engine] Silence timeout -> Stopping");
    stopSession();
  }, SILENCE_TIMEOUT_MS);
}

// --- ГОЛОВНА ФУНКЦІЯ ЗУПИНКИ ---
function stopSession() {
  console.log("[Golos Engine] stopSession called");

  isManuallyStopped = true;

  // Граємо звук (навіть якщо буфер ще вантажиться, await почекає)
  playSound("end");

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.CMD_START_SESSION) {
    currentTargetTabId = message.targetTabId;
    isManuallyStopped = false;

    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
    if (recognition) recognition.abort();

    // Ініціалізація
    initRecognition().then((rec) => {
      recognition = rec;
      try {
        recognition.start();
        updateStatusUI(`Listening ${currentTargetTabId}`);
        sendResponse({ started: true });
      } catch (e) {
        sendResponse({ started: false, error: e.message });
      }
    });
    return true; // Keep channel open
  }

  if (message.type === MSG.CMD_STOP_SESSION) {
    stopSession();
    sendResponse({ stopped: true });
  }
});

function updateStatusUI(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

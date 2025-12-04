import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Ready to listen.");

let recognition = null;
let currentTargetTabId = null;

// Функція ініціалізації розпізнавання
function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("[Golos Engine] Web Speech API not supported!");
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "uk-UA"; // Поки що хардкод, потім візьмемо зі storage

  rec.onstart = () => {
    console.log("[Golos Engine] Mic ON");
    sendState("listening");
  };

  rec.onend = () => {
    console.log("[Golos Engine] Mic OFF");
    sendState("idle");
  };

  rec.onresult = (event) => {
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

    // Відправляємо текст у Background -> Content
    if (currentTargetTabId) {
      chrome.runtime.sendMessage({
        type: MSG.EVENT_TRANSCRIPT,
        text: final || interim,
        isFinal: !!final,
        targetTabId: currentTargetTabId,
      });
    }
  };

  rec.onerror = (event) => {
    console.warn("[Golos Engine] Error:", event.error);
    // Якщо помилка 'no-speech', ігноруємо. Якщо інші - стопаємо.
    if (event.error !== "no-speech") {
      sendState("error");
    }
  };

  return rec;
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

// Обробка команд від Background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.CMD_START_SESSION) {
    currentTargetTabId = message.targetTabId;

    // Перезапускаємо інстанс
    if (recognition) recognition.abort();
    recognition = initRecognition();

    try {
      recognition.start();
      updateStatusUI(`Listening for tab ${currentTargetTabId}...`);
    } catch (e) {
      console.error("Start error:", e);
    }
  }

  if (message.type === MSG.CMD_STOP_SESSION) {
    if (recognition) recognition.stop();
    updateStatusUI("Idle");
  }
});

function updateStatusUI(text) {
  const el = document.getElementById("status"); // Якщо є в HTML
  if (el) el.textContent = text;
}

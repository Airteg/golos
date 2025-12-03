console.log("[Golos] content-script loaded on", window.location.href);

// --- Dictation (Web Speech API) ---

let golosRecognition = null;
let golosIsDictating = false;

function getSpeechRecognitionCtor() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  return SpeechRecognition || null;
}

function getActiveEditableElement() {
  const el = document.activeElement;
  if (!el) return null;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }

  if (el && el.isContentEditable) {
    return el;
  }

  return null;
}

function insertTextToActiveElement(textToInsert) {
  if (!textToInsert) return;

  const el = getActiveEditableElement();
  if (!el) {
    console.warn("[Golos] Dictation: немає придатного активного елемента");
    return;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const current = el.value || "";
    const sep = current && !current.endsWith(" ") ? " " : "";
    el.value = current + sep + textToInsert;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el.isContentEditable) {
    const current = el.textContent || "";
    const sep = current && !current.endsWith(" ") ? " " : "";
    el.textContent = current + sep + textToInsert;
  }

  console.log("[Golos] Dictation inserted →", textToInsert);
}

function startDictation() {
  if (golosIsDictating) {
    console.log("[Golos] Dictation already running");
    return;
  }

  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    console.warn(
      "[Golos] Web Speech API недоступний (немає SpeechRecognition / webkitSpeechRecognition)"
    );
    return;
  }

  const el = getActiveEditableElement();
  if (!el) {
    console.warn(
      "[Golos] Dictation: немає активного input/textarea/contenteditable"
    );
    return;
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "uk-UA"; // базово українська; потім можна зав'язати на режим

  recognition.onstart = () => {
    golosIsDictating = true;
    console.log("[Golos] Dictation started");
  };

  recognition.onerror = (event) => {
    console.warn("[Golos] Dictation error:", event.error, event.message);
  };

  recognition.onend = () => {
    golosIsDictating = false;
    console.log("[Golos] Dictation ended");
  };

  recognition.onresult = (event) => {
    let finalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finalText += res[0].transcript;
      }
    }

    finalText = finalText.trim();
    if (finalText) {
      insertTextToActiveElement(finalText);
    }
  };

  try {
    recognition.start();
    golosRecognition = recognition;
  } catch (err) {
    console.error("[Golos] Dictation start error:", err);
  }
}

function stopDictation() {
  if (!golosIsDictating || !golosRecognition) {
    console.log("[Golos] Dictation is not running");
    return;
  }

  try {
    golosRecognition.stop();
  } catch (err) {
    console.error("[Golos] Dictation stop error:", err);
  } finally {
    golosRecognition = null;
  }
}

// --- Старі GOLOS_GET_TEXT / GOLOS_SET_TEXT + нові диктування ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GOLOS_GET_TEXT") {
    const el = document.activeElement;
    let text = "";

    if (!el) {
      text = "[немає активного елемента]";
    } else if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    ) {
      text = el.value;
    } else if (el && el.isContentEditable) {
      text = el.textContent || "";
    } else {
      text = "[активний елемент не є input/textarea/contenteditable]";
    }

    console.log("[Golos] GET_TEXT →", text);
    sendResponse({ text });

    // синхронна відповідь, можна не повертати true
    return;
  }

  if (message.type === "GOLOS_SET_TEXT") {
    const { text } = message;
    const el = document.activeElement;

    if (!el) {
      console.warn("[Golos] SET_TEXT: немає активного елемента");
      return;
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el && el.isContentEditable) {
      el.textContent = text;
    } else {
      console.warn("[Golos] SET_TEXT: активний елемент не підтримується");
    }

    console.log("[Golos] SET_TEXT →", text);
    return;
  }

  if (message.type === "GOLOS_START_DICTATION") {
    console.log("[Golos] message: START_DICTATION");
    startDictation();
    return;
  }

  if (message.type === "GOLOS_STOP_DICTATION") {
    console.log("[Golos] message: STOP_DICTATION");
    stopDictation();
    return;
  }
});

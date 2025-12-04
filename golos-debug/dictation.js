let dictationActive = false;

const btn = document.getElementById("toggle");
const statusEl = document.getElementById("status");
const liveEl = document.getElementById("live");

function updateUI() {
  if (dictationActive) {
    btn.textContent = "⏹ Зупинити";
    statusEl.textContent = "Слухаю…";
  } else {
    btn.textContent = "🎙 Почати диктування";
    statusEl.textContent = "";
    liveEl.textContent = "";
  }
}

btn.addEventListener("click", () => {
  const type = dictationActive
    ? "GOLOS_STOP_DICTATION"
    : "GOLOS_START_DICTATION";

  chrome.runtime.sendMessage({ type }, (res) => {
    dictationActive = !dictationActive;
    updateUI();
  });
});

updateUI();

// Отримуємо текст від content-script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "DICTATION_INTERIM") {
    liveEl.textContent = msg.text;
  }

  if (msg.type === "DICTATION_FINAL") {
    liveEl.textContent = msg.text;
  }
});

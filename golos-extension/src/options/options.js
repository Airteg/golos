// options/options.js

const langSelect = document.getElementById("lang");
const saveBtn = document.getElementById("save");
const statusSpan = document.getElementById("status");

// 1. Відновлення налаштувань
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get({ golosLang: "uk-UA" }, (items) => {
    langSelect.value = items.golosLang;
  });
});

// 2. Збереження
saveBtn.addEventListener("click", () => {
  const lang = langSelect.value;

  chrome.storage.sync.set({ golosLang: lang }, () => {
    // Ефект "Збережено"
    statusSpan.style.opacity = "1";
    setTimeout(() => {
      statusSpan.style.opacity = "0";
    }, 1500);

    console.log("[Golos Options] Saved:", lang);
  });
});

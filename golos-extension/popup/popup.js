document.addEventListener("DOMContentLoaded", async () => {
  const langSelect = document.getElementById("lang-select");
  const statusDot = document.getElementById("status-dot");
  const statusText = document.getElementById("status-text");

  // 1. Завантажуємо збережену мову (за замовчуванням uk-UA)
  chrome.storage.sync.get({ golosLang: "uk-UA" }, (items) => {
    langSelect.value = items.golosLang;
  });

  // 2. Зберігаємо при зміні
  langSelect.addEventListener("change", () => {
    const newVal = langSelect.value;
    chrome.storage.sync.set({ golosLang: newVal }, () => {
      console.log("Language saved:", newVal);
      // Можна блимнути користувачу, що збережено
    });
  });

  // 3. Перевіряємо, чи живий Engine
  const engineUrl = chrome.runtime.getURL("engine/engine.html");
  const tabs = await chrome.tabs.query({ url: engineUrl });

  if (tabs.length > 0) {
    statusDot.classList.add("ok");
    statusText.textContent = "Engine Ready";
  } else {
    statusDot.classList.remove("ok");
    statusText.textContent = "Engine Sleeping";
  }
});

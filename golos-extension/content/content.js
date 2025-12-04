(async () => {
  try {
    // 1. Отримуємо правильні шляхи до файлів всередині розширення
    const srcMessaging = chrome.runtime.getURL("utils/messaging.js");
    const srcWidget = chrome.runtime.getURL("content/dom-injector.js");
    console.log("%csrcMessaging:", "color: red;", srcMessaging);
    console.log("%csrcWidget:", "color: red;", srcWidget);

    // 2. Динамічно імпортуємо їх
    const { MSG } = await import(srcMessaging);
    const { GolosWidget } = await import(srcWidget);
    console.log("%cMSG:", "color: red;", MSG);
    console.log("%cGolosWidget:", "color: red;", GolosWidget);

    console.log(
      "%c[Golos Host] Modules loaded via dynamic import",
      "color: teal;"
    );

    // 3. Ініціалізуємо віджет
    const widget = new GolosWidget();

    // --- Слухаємо команди від Background ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Команда "Показати віджет" (від хоткея Alt+Shift+G)
      if (message.type === "CMD_ShowWidget") {
        console.log("[Golos Host] Showing widget...");
        widget.show();
      }

      // Отримання тексту (заглушка для майбутнього)
      if (message.type === MSG.EVENT_TRANSCRIPT) {
        widget.updateText(message.text, message.isFinal);
      }
    });
  } catch (err) {
    console.error("[Golos Host] Failed to load modules:", err);
  }
})();

(async () => {
  try {
    const srcMessaging = chrome.runtime.getURL("utils/messaging.js");
    const srcWidget = chrome.runtime.getURL("content/dom-injector.js");
    const srcInput = chrome.runtime.getURL("content/input-simulator.js");

    const { MSG } = await import(srcMessaging);
    const { GolosWidget } = await import(srcWidget);
    const { insertText, getActiveEditable } = await import(srcInput);

    console.log("[Golos Host] All modules loaded");
    const widget = new GolosWidget();

    // Обробка кліку на хрестик
    widget.onStopClick(() => {
      console.log("[Golos Host] User clicked Stop");
      chrome.runtime.sendMessage({ type: MSG.CMD_STOP_SESSION });
      widget.hide();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 1. Команда "Показати віджет" - тепер повертає відповідь!
      if (message.type === "CMD_ShowWidget") {
        const el = getActiveEditable();
        if (el) {
          widget.show();
          // Кажемо Background'у: "Все ок, поле є"
          sendResponse({ ok: true });
        } else {
          // console.warn("No editable element found");
          // Кажемо Background'у: "Стоп! Немає поля"
          sendResponse({ ok: false });
        }
      }

      // ... решта коду (EVENT_STATE_CHANGE, EVENT_TRANSCRIPT) без змін ...
      if (message.type === MSG.EVENT_STATE_CHANGE) {
        widget.setStatusCode(message.state);
        if (message.state === "idle") {
          setTimeout(() => widget.hide(), 500);
        }
      }

      if (message.type === MSG.EVENT_TRANSCRIPT) {
        widget.updateText(message.text, message.isFinal);
        if (message.isFinal) {
          const el = getActiveEditable();
          if (el) insertText(el, message.text);
        }
      }

      // Важливо: повертаємо true, щоб sendResponse працював коректно (хоча тут ми відповідаємо синхронно, це хороша звичка)
      // Але для синхронної відповіді можна і не повертати.
    });
  } catch (err) {
    console.error("[Golos Host] Error:", err);
  }
})();

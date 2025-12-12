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

    widget.onStopClick(() => {
      console.log("[Golos Host] User clicked Stop");
      chrome.runtime.sendMessage({ type: MSG.CMD_STOP_SESSION });
      widget.hide();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "CMD_ShowWidget") {
        const el = getActiveEditable();
        if (el) {
          widget.show();

          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
      }

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
    });
  } catch (err) {
    console.error("[Golos Host] Error:", err);
  }
})();

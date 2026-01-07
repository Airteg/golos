(async () => {
  try {
    const srcMessaging = chrome.runtime.getURL("utils/messaging.js");
    const srcWidget = chrome.runtime.getURL("content/dom-injector.js");
    const srcInput = chrome.runtime.getURL("content/input-simulator.js");

    const { MSG } = await import(srcMessaging);
    const { GolosWidget } = await import(srcWidget);
    const { insertText, getActiveEditable } = await import(srcInput);

    console.log("[Golos Host] All modules loaded v2.4 Stable");
    const widget = new GolosWidget();

    widget.onStopClick(() => {
      chrome.runtime.sendMessage({ type: MSG.CMD_STOP_SESSION });
      widget.hide();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === MSG.CMD_PING_WIDGET) {
        const el = getActiveEditable();
        if (el) {
          widget.show();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }

        return false;
      }

      if (message.type === MSG.EVENT_STATE_CHANGE) {
        widget.setStatusCode(message.state);
        if (message.state === "idle") {
          setTimeout(() => widget.hide(), 500);
        }
        return false;
      }

      if (message.type === MSG.EVENT_TRANSCRIPT) {
        widget.updateText(message.text, message.isFinal);
        if (message.isFinal) {
          const el = getActiveEditable();
          if (el) insertText(el, message.text);
        }
        return false;
      }

      return false;
    });
  } catch (err) {
    console.error("[Golos Host] Error:", err);
  }
})();

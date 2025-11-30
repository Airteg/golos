console.log("[Golos] content-script loaded on", window.location.href);

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
  }
});

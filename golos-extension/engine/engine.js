import { MSG } from "../utils/messaging.js";

console.log("[Golos Engine] Loaded and ready.");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Golos Engine] Received message:", message);

  // Тут пізніше буде логіка мікрофона

  return true;
});

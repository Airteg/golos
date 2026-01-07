const players = new Map();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "SFX_PLAY") return;

  try {
    const path = msg.path;
    const url = chrome.runtime.getURL(path);

    let audio = players.get(path);
    if (!audio) {
      audio = new Audio(url);
      players.set(path, audio);
    } else {
      audio.pause();
      audio.currentTime = 0;
    }

    audio.volume = typeof msg.volume === "number" ? msg.volume : 0.6;

    audio.play().catch((err) => {
      console.warn("[Offscreen] Audio play error:", err);
    });
  } catch (e) {
    console.error("[Offscreen] Critical error:", e);
  }
});

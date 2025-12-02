// background.js

chrome.commands.onCommand.addListener((command) => {
  console.log("[Golos] onCommand fired:", command);

  if (command !== "golos-process-selection") {
    return;
  }

  // Знайти активну вкладку
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    if (!tab || !tab.id) {
      console.warn("[Golos] no active tab");
      return;
    }

    // Попросити content-script віддати текст
    chrome.tabs.sendMessage(
      tab.id,
      { type: "GOLOS_GET_TEXT" },
      async (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[Golos] sendMessage error:",
            chrome.runtime.lastError.message
          );
          return;
        }

        if (!response || typeof response.text !== "string") {
          console.warn("[Golos] empty response from content-script");
          return;
        }

        console.log("[Golos] captured from content-script:", response.text);

        let processedText = response.text;

        // 🔹 Спроба відправити текст на бекенд з GPT
        try {
          const res = await fetch("http://127.0.0.1:3000/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "uk-clean",
              text: response.text,
            }),
          });

          if (!res.ok) {
            console.warn("[Golos] backend returned non-OK:", res.status);
          } else {
            const data = await res.json();
            if (data && typeof data.text === "string") {
              processedText = data.text;
            } else {
              console.warn(
                "[Golos] backend JSON without .text, fallback to original"
              );
            }
          }
        } catch (e) {
          console.warn("[Golos] backend fetch error, fallback to original:", e);
        }

        // Вставити (можливо, змінений) текст назад у сторінку
        console.log("[Golos] processedText (final):", processedText);

        chrome.tabs.sendMessage(tab.id, {
          type: "GOLOS_SET_TEXT",
          text: processedText,
        });
      }
    );
  });
});

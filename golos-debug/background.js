console.log("[Golos] captured from content-script:", response.text);

let processedText = response.text;

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
      console.warn("[Golos] backend JSON without .text, fallback to original");
    }
  }
} catch (e) {
  console.warn("[Golos] backend fetch error, fallback to original:", e);
}

chrome.tabs.sendMessage(tab.id, {
  type: "GOLOS_SET_TEXT",
  text: processedText,
});

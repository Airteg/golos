function renderStatus(health) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const detailEl = document.getElementById("detail");

  if (!health || health.ok === null) {
    dot.className = "dot";
    text.textContent = "Статус невідомий";
    detailEl.textContent = "";
    return;
  }

  if (health.ok) {
    dot.className = "dot ok";
    text.textContent = "🟢 Golos Online";
    const model =
      health.detail && health.detail.model ? health.detail.model : "unknown";
    const latency =
      health.detail && typeof health.detail.latencyMs === "number"
        ? `${health.detail.latencyMs} ms`
        : "—";
    detailEl.textContent = `model: ${model}\nlatency: ${latency}`;
  } else {
    dot.className = "dot bad";
    text.textContent = "🔴 Golos Offline";

    let detail = "";
    if (health.reason) detail += `reason: ${health.reason}\n`;
    if (health.detail) detail += `detail: ${health.detail}`;
    detailEl.textContent = detail.trim();
  }
}

function requestStatus(force = false) {
  chrome.runtime.sendMessage(
    { type: "GOLOS_GET_STATUS", force },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Golos popup] sendMessage error:",
          chrome.runtime.lastError.message
        );
        renderStatus(null);
        return;
      }
      renderStatus(response);
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  requestStatus(false);

  const btn = document.getElementById("refresh");
  btn.addEventListener("click", () => {
    requestStatus(true);
  });
});

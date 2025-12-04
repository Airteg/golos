export class GolosWidget {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.statusDot = null;
    this.statusText = null;
    this.contentArea = null;
    this.closeBtn = null; // НОВЕ
    this._isMounted = false;
    this.onStopCallback = null; // НОВЕ: функція зворотного виклику
  }

  // Метод для підписки на клік (викличемо його в content.js)
  onStopClick(callback) {
    this.onStopCallback = callback;
  }

  mount() {
    if (this._isMounted) return;

    this.host = document.createElement("div");
    this.host.id = "golos-shadow-host";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const linkElem = document.createElement("link");
    linkElem.setAttribute("rel", "stylesheet");
    linkElem.setAttribute("href", chrome.runtime.getURL("assets/styles.css"));
    this.shadow.appendChild(linkElem);

    const wrapper = document.createElement("div");
    wrapper.className = "golos-widget golos-hidden";
    // Кнопка .golos-close
    wrapper.innerHTML = `
      <div class="golos-header">
        <div class="golos-status">
          <div class="golos-dot"></div>
          <span class="golos-status-text">Golos</span>
        </div>
        <div class="golos-close" style="cursor: pointer; padding: 4px; font-weight: bold;">✖</div>
      </div>
      <div class="golos-content">
        <span class="golos-placeholder">Говоріть...</span>
      </div>
    `;
    this.shadow.appendChild(wrapper);

    this.root = wrapper;
    this.statusDot = wrapper.querySelector(".golos-dot");
    this.statusText = wrapper.querySelector(".golos-status-text");
    this.contentArea = wrapper.querySelector(".golos-content");
    this.closeBtn = wrapper.querySelector(".golos-close"); // НОВЕ

    // НОВЕ: Слухаємо клік
    this.closeBtn.addEventListener("click", () => {
      if (this.onStopCallback) this.onStopCallback();
    });

    document.body.appendChild(this.host);
    this._isMounted = true;
  }

  show() {
    if (!this._isMounted) this.mount();
    this.root.classList.remove("golos-hidden");
    this.setStatusCode("connecting");
  }

  hide() {
    if (this.root) this.root.classList.add("golos-hidden");
  }

  updateText(text, isFinal) {
    if (!text) {
      this.contentArea.innerHTML =
        '<span class="golos-placeholder">Говоріть...</span>';
      return;
    }
    this.contentArea.textContent = text;
  }

  setStatusCode(code) {
    this.statusDot.className = "golos-dot";
    switch (code) {
      case "listening":
        this.statusDot.classList.add("listening");
        this.statusText.textContent = "Слухаю...";
        break;
      case "processing":
        this.statusDot.classList.add("processing");
        this.statusText.textContent = "Обробка...";
        break;
      case "connecting":
        this.statusText.textContent = "Запуск...";
        break;
      default:
        this.statusText.textContent = "Golos";
    }
  }
}

export class GolosWidget {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.statusDot = null;
    this.statusText = null;
    this.contentArea = null;
    this._isMounted = false;
  }

  mount() {
    if (this._isMounted) return;

    // 1. Створюємо "тіньовий" контейнер
    this.host = document.createElement("div");
    this.host.id = "golos-shadow-host";
    this.shadow = this.host.attachShadow({ mode: "open" });

    // 2. Вставляємо стилі
    const linkElem = document.createElement("link");
    linkElem.setAttribute("rel", "stylesheet");
    linkElem.setAttribute("href", chrome.runtime.getURL("assets/styles.css"));
    this.shadow.appendChild(linkElem);

    // 3. Вставляємо HTML
    const wrapper = document.createElement("div");
    wrapper.className = "golos-widget golos-hidden";
    wrapper.innerHTML = `
      <div class="golos-header">
        <div class="golos-status">
          <div class="golos-dot"></div>
          <span class="golos-status-text">Golos</span>
        </div>
      </div>
      <div class="golos-content">
        <span class="golos-placeholder">Говоріть...</span>
      </div>
    `;
    this.shadow.appendChild(wrapper);

    // 4. Зберігаємо посилання на елементи
    this.root = wrapper;
    this.statusDot = wrapper.querySelector(".golos-dot");
    this.statusText = wrapper.querySelector(".golos-status-text");
    this.contentArea = wrapper.querySelector(".golos-content");

    // 5. Додаємо в сторінку
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
    // Простий захист від XSS, хоча ми в Shadow DOM
    this.contentArea.textContent = text;
  }

  setStatusCode(code) {
    // code: 'connecting' | 'listening' | 'processing' | 'idle'
    this.statusDot.className = "golos-dot"; // скидання

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

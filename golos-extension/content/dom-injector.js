export class GolosWidget {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.statusDot = null;
    this.statusText = null;
    this.contentArea = null;
    this.closeBtn = null;
    this._isMounted = false;
    this.onStopCallback = null;
  }

  onStopClick(callback) {
    this.onStopCallback = callback;
  }

  mount() {
    if (this._isMounted) return;

    this.host = document.createElement("div");
    this.host.id = "golos-shadow-host";

    // --- ВИПРАВЛЕНІ СТИЛІ HOST ---
    // Використовуємо fixed, щоб віджет не скролився зі сторінкою
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.display = "block";

    // Початкова позиція (можна змінити на будь-яку)
    this.host.style.bottom = "20px";
    this.host.style.right = "20px";
    this.host.style.left = "auto";
    this.host.style.top = "auto";

    this.shadow = this.host.attachShadow({ mode: "open" });

    const linkElem = document.createElement("link");
    linkElem.setAttribute("rel", "stylesheet");
    linkElem.setAttribute("href", chrome.runtime.getURL("assets/styles.css"));
    this.shadow.appendChild(linkElem);

    const wrapper = document.createElement("div");
    wrapper.className = "golos-widget golos-hidden";

    // Додаємо HTML
    wrapper.innerHTML = `
      <div class="golos-header" id="drag-handle">
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
    this.closeBtn = wrapper.querySelector(".golos-close");

    // Зупинка (щоб клік не викликав drag)
    this.closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStopCallback) this.onStopCallback();
    });

    document.body.appendChild(this.host);

    // Ініціалізація перетягування
    const header = wrapper.querySelector(".golos-header");
    this.makeDraggable(header);

    this._isMounted = true;
  }

  // --- СТАБІЛЬНА ЛОГІКА DRAG & DROP (FIXED) ---
  makeDraggable(triggerElement) {
    const onMouseDown = (e) => {
      // Ігноруємо правий клік
      if (e.button !== 0) return;

      e.preventDefault(); // Забороняємо виділення тексту

      // 1. Отримуємо поточні координати віджета відносно вікна
      const rect = this.host.getBoundingClientRect();

      // 2. Рахуємо зсув курсора всередині шапки (щоб віджет не стрибав до центру мишки)
      const shiftX = e.clientX - rect.left;
      const shiftY = e.clientY - rect.top;

      // 3. ПЕРЕМИКАЄМОСЯ НА КООРДИНАТИ LEFT/TOP
      // Це критичний момент: ми "відриваємо" віджет від bottom/right
      this.host.style.bottom = "auto";
      this.host.style.right = "auto";
      this.host.style.left = rect.left + "px";
      this.host.style.top = rect.top + "px";

      // Гарантуємо, що він fixed
      this.host.style.position = "fixed";
      this.host.style.transition = "none"; // Вимикаємо анімацію під час руху

      // Функція руху
      const onMouseMove = (moveEvent) => {
        moveEvent.preventDefault();

        // Нові координати
        let newLeft = moveEvent.clientX - shiftX;
        let newTop = moveEvent.clientY - shiftY;

        // --- ОБМЕЖЕННЯ (ЩОБ НЕ ВИЛЕТІВ ЗА ЕКРАН) ---
        const winWidth = document.documentElement.clientWidth;
        const winHeight = document.documentElement.clientHeight;
        const hostWidth = this.host.offsetWidth;
        const hostHeight = this.host.offsetHeight;

        // Не пускаємо за лівий/верхній край
        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;

        // Не пускаємо за правий/нижній край
        if (newLeft + hostWidth > winWidth) newLeft = winWidth - hostWidth;
        if (newTop + hostHeight > winHeight) newTop = winHeight - hostHeight;

        // Застосовуємо
        this.host.style.left = newLeft + "px";
        this.host.style.top = newTop + "px";
      };

      // Функція закінчення
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        // Повертаємо transition (якщо треба для opacity)
        // this.host.style.transition = "";
      };

      // Слухаємо події на document (щоб не загубити мишку при різкому русі)
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    triggerElement.addEventListener("mousedown", onMouseDown);
  }

  show() {
    if (!this._isMounted) this.mount();
    this.contentArea.innerHTML =
      '<span class="golos-placeholder">Говоріть...</span>';
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
      case "idle":
        this.statusText.textContent = "Golos";
        break;
      case "error":
        this.statusText.textContent = "Помилка";
        break;
      case "connecting":
        this.statusText.textContent = "Запуск...";
        break;
      default:
        this.statusText.textContent = "Golos";
    }
  }
}

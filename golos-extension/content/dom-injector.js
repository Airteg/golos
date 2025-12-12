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

    // ЗВУКІВ ТУТ БІЛЬШЕ НЕМАЄ.
    // Ми перенесли їх в Engine, щоб обійти блокування Chrome.
  }

  onStopClick(callback) {
    this.onStopCallback = callback;
  }

  mount() {
    if (this._isMounted) return;
    this.host = document.createElement("div");
    this.host.id = "golos-shadow-host";

    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.display = "block";
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

    this.closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onStopCallback) this.onStopCallback();
    });

    document.body.appendChild(this.host);

    const header = wrapper.querySelector(".golos-header");
    this.makeDraggable(header);
    this.restorePosition();

    this._isMounted = true;
  }

  savePosition(left, top) {
    chrome.storage.local.set({ golosWidgetPos: { left, top } });
  }

  restorePosition() {
    chrome.storage.local.get(["golosWidgetPos"], (result) => {
      if (result.golosWidgetPos) {
        const { left, top } = result.golosWidgetPos;
        const winWidth = document.documentElement.clientWidth;
        const winHeight = document.documentElement.clientHeight;

        if (left > winWidth - 50 || top > winHeight - 50) return;

        this.host.style.bottom = "auto";
        this.host.style.right = "auto";
        this.host.style.left = left + "px";
        this.host.style.top = top + "px";
      }
    });
  }

  makeDraggable(triggerElement) {
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const rect = this.host.getBoundingClientRect();
      const shiftX = e.clientX - rect.left;
      const shiftY = e.clientY - rect.top;

      this.host.style.bottom = "auto";
      this.host.style.right = "auto";
      this.host.style.left = rect.left + "px";
      this.host.style.top = rect.top + "px";
      this.host.style.position = "fixed";
      this.host.style.transition = "none";

      const onMouseMove = (moveEvent) => {
        moveEvent.preventDefault();
        let newLeft = moveEvent.clientX - shiftX;
        let newTop = moveEvent.clientY - shiftY;

        const winWidth = document.documentElement.clientWidth;
        const winHeight = document.documentElement.clientHeight;
        const hostWidth = this.host.offsetWidth;
        const hostHeight = this.host.offsetHeight;

        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + hostWidth > winWidth) newLeft = winWidth - hostWidth;
        if (newTop + hostHeight > winHeight) newTop = winHeight - hostHeight;

        this.host.style.left = newLeft + "px";
        this.host.style.top = newTop + "px";
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        const finalRect = this.host.getBoundingClientRect();
        this.savePosition(finalRect.left, finalRect.top);
      };

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
    this.contentArea.scrollTop = this.contentArea.scrollHeight;
  }

  setStatusCode(code) {
    // Тільки візуал!
    console.log("[GolosWidget] status:", code);
    if (!this.statusDot) return;

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
        this.statusDot.classList.add("error");
        break;
      case "connecting":
        this.statusText.textContent = "Запуск...";
        break;
      default:
        this.statusText.textContent = "Golos";
    }
  }
}

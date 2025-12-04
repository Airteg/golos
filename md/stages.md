## 0. Старт: що в нас є зараз

- `background.js` — слухає `Alt+Shift+G`, тягне текст з `content-script`, шле на `/health` і `/process` локального бекенда, повертає результат у поле. Також обробляє GOLOS_GET_STATUS і примітивний диктейт через popup/dictation.
- `content-script.js` — вміє:

  - читати/ставити текст в active input/textarea/contentEditable;
  - запускати `SpeechRecognition` у _самій сторінці_ по повідомленнях `GOLOS_START_DICTATION` / `GOLOS_STOP_DICTATION`.

- `popup.html/js` + `dictation.html/js` — кістлявий UI, який просто посилає `START/STOP` в background, а той уже пересилає в content-script.
- backend `index.js` — окремий Node-сервер з `/health` і `/process` на GPT.

Нова концепція 2.0: **Host / Router / Engine** + Engine Tab + Shadow DOM модалка.
У plan.md вже є 4 етапи — далі я їх розгортаю в конкретні кроки.

---

## 1. Етап 1 — “Фундамент / Engine Room”

**Ціль:** з’являється окрема pinned-вкладка `Engine`, яка живе постійно й уміє спілкуватися з background. Web Speech можна ввімкнути трохи пізніше, але каркас має бути.

### 1.1. Розкласти файли по новій структурі

1. Створити папки:

   - `background/`
   - `content/`
   - `engine/`
   - `popup/`
   - `assets/`
   - `utils/`

2. Пересунути файли:

   - `background.js` → `background/service-worker.js`
   - `content-script.js` → `content/content.js`
   - `popup.html` → `popup/popup.html`
   - `popup.js` → `popup/popup.js`
   - `dictation.html`/`dictation.js` тимчасово покласти в `legacy/` (щоб не втратити, але більше не чіпати).

3. В `manifest.json`:

   - Оновити шлях до background:

     ```json
     "background": {
       "service_worker": "background/service-worker.js"
     }
     ```

   - Оновити content_scripts:

     ```json
     "content_scripts": [
       {
         "matches": ["<all_urls>"],
         "js": ["content/content.js"],
         "run_at": "document_idle"
       }
     ]
     ```

   - Додати дозволи:

     ```json
     "permissions": ["activeTab", "storage", "tabs", "scripting"],
     "host_permissions": ["<all_urls>"]
     ```

### 1.2. Завести `engine.html` + `engine.js` (ще без мікрофону)

1. Створити `engine/engine.html` з мінімумом:

   ```html
   <!DOCTYPE html>
   <html lang="uk">
     <head>
       <meta charset="utf-8" />
       <title>Golos Engine</title>
     </head>
     <body>
       <div id="status">Engine loading…</div>
       <script src="engine.js"></script>
     </body>
   </html>
   ```

2. Створити `engine/engine.js` з базовим кодом:

   - `console.log('[Golos Engine] loaded')`;
   - `chrome.runtime.onMessage.addListener(...)`, який поки що лише логуватиме всі повідомлення від background (типи `CMD_START_SESSION`, `CMD_STOP_SESSION` — ми їх введемо нижче).

3. Переконатися, що файл відкривається по `chrome.runtime.getURL("engine/engine.html")` з консолі background.

### 1.3. Винести типи повідомлень у `utils/messaging.js`

1. Створити `utils/messaging.js`:

   ```js
   export const MSG = {
     CMD_START_SESSION: "CMD_START_SESSION",
     CMD_STOP_SESSION: "CMD_STOP_SESSION",
     EVENT_TRANSCRIPT: "EVENT_TRANSCRIPT",
     EVENT_STATE_CHANGE: "EVENT_STATE_CHANGE",
     EVENT_ERROR: "EVENT_ERROR",
   };
   ```

2. Поки що в чистому JS можна робити звичайний `const MSG = {...};` і підключати через `<script>` або `import` (залежно від того, чи хочеш зараз збірку, чи лишаємо все як є).

### 1.4. Реалізувати `ensureEngineTab()` у background

У `background/service-worker.js`:

1. Додати функцію:

   ```js
   let engineTabId = null;

   async function ensureEngineTab() {
     // шукаємо вкладку з нашим URL
     const url = chrome.runtime.getURL("engine/engine.html");
     const tabs = await chrome.tabs.query({ url });

     if (tabs.length > 0) {
       engineTabId = tabs[0].id;
       return engineTabId;
     }

     const created = await chrome.tabs.create({
       url,
       pinned: true,
       active: false,
     });

     engineTabId = created.id;
     return engineTabId;
   }
   ```

2. Викликати `ensureEngineTab()`:

   - при першому `onInstalled` / `onStartup`;
   - при першому запуску сесії диктування (Alt+Shift+G) — як fallback, якщо вкладку вбили/закрили.

3. Додати обробник `chrome.tabs.onRemoved` — якщо закрили engine-вкладку, обнулити `engineTabId`.

### 1.5. Прив’язати Engine до гарячої клавіші (без диктації)

1. У `chrome.commands.onCommand` зараз ти обробляєш лише `golos-process-selection`.

2. Додати гілку:

   ```js
   chrome.commands.onCommand.addListener(async (command) => {
     if (command === "golos-process-selection") {
       // Поки НЕ чіпаємо стару логіку /process
       // …
     }

     if (command === "golos-dictation") {
       const tabId = await ensureEngineTab();
       if (!tabId) return;

       // далі — відправка CMD_START_SESSION, але це вже етап 2
     }
   });
   ```

3. У `manifest.json` додати окрему команду для диктації (або тимчасово перевикористати ту саму).

---

## 2. Етап 2 — “Обличчя та проводка”: Widget + Router

**Ціль:** при натисканні хоткея ми показуємо модалку _на сторінці_ й ганяємо повідомлення між Host ↔ Router ↔ Engine. Мікрофон вже можна вмикати тут.

### 2.1. Розділити `content-script.js` на Host + Input API

1. Поточний `content-script.js`:

   - читає/ставить текст;
   - запускає Web Speech API.

2. Розділити на:

   - `content/content.js` — логіка повідомлень, вставка тексту (GOLOS_GET/SET_TEXT), дергання widget API.
   - `content/input-simulator.js` — низькорівнева робота з DOM: знайти активний елемент, вставити текст, кинути `input`/`change` події (щоб React/Angular помітили).
   - `content/dom-injector.js` — Shadow DOM модалка.

На цьому етапі **весь код Web Speech API прибираємо з content** — він більше житиме тільки в `engine.js`.

### 2.2. Реалізувати `GolosWidget` (Shadow DOM)

У `content/dom-injector.js`:

1. Створити клас на кшталт:

   ```js
   class GolosWidget {
     constructor() {
       // створюємо контейнер
       this.host = document.createElement("div");
       this.host.id = "golos-widget-root";
       document.documentElement.appendChild(this.host);

       this.shadow = this.host.attachShadow({ mode: "open" });

       // вставляємо стилі + HTML
       this.shadow.innerHTML = `...`;
       this.rootEl = this.shadow.querySelector(".golos-root");
       this.textEl = this.shadow.querySelector(".golos-text");
       this.statusEl = this.shadow.querySelector(".golos-status");
       // …
     }

     showConnecting() { … }
     updateText(text, isFinal) { … }
     showError(msg) { … }
     hide() { … }
   }

   let widget = null;

   export function getWidget() {
     if (!widget) widget = new GolosWidget();
     return widget;
   }
   ```

2. Стилі покласти або інлайном у `innerHTML`, або підтягнути `assets/styles.css` як `<link rel="stylesheet" href="${chrome.runtime.getURL('assets/styles.css')}">`.

3. У `content/content.js` тримати посилання на widget і викликати:

   - `widget.showConnecting()` при старті сесії;
   - `widget.updateText(text, false)` — для поточного результату;
   - `widget.updateText(text, true)` + `widget.hide()` після вставки в поле.

### 2.3. Протокол повідомлень Host ↔ Router ↔ Engine

Використовуємо типи з концепції: `CMD_*` і `EVENT_*`.

1. **Host (content) → Router (background):**

   - `CMD_START_SESSION_FROM_HOST` — віджет каже: “користувач натиснув Старт”.
   - `CMD_STOP_SESSION_FROM_HOST` — “користувач натиснув Стоп у модалці”.

2. **Router → Engine:**

   - `CMD_START_SESSION` — з полем `tabId`, щоб Engine знав, куди потім слати текст.
   - `CMD_STOP_SESSION`.

3. **Engine → Router → Host:**

   - `EVENT_STATE_CHANGE` (`"connecting" | "listening" | "finalizing" | "idle"`).
   - `EVENT_TRANSCRIPT` ( `{ text, isFinal, tabId }` ).
   - `EVENT_ERROR` ( `{ code, message, tabId }` ).

### 2.4. Логіка в background/service-worker

1. У `chrome.commands.onCommand` для хоткея:

   - визначити активну вкладку `activeTab` (там, де користувач диктує);
   - послати в content цієї вкладки: `{ type: "CMD_START_SESSION_FROM_SHORTCUT" }`;
   - паралельно викликати `ensureEngineTab()` і надіслати в Engine: `{ type: "CMD_START_SESSION", tabId: activeTab.id }`.

2. Додати `chrome.runtime.onMessage.addListener`:

   - Якщо `message.type === "CMD_START_SESSION_FROM_HOST"`:

     - викликати `ensureEngineTab()`;
     - переслати в Engine `{ type: "CMD_START_SESSION", tabId: sender.tab.id }`.

   - Якщо `message.type === "CMD_STOP_SESSION_FROM_HOST"`:

     - переслати в Engine `{ type: "CMD_STOP_SESSION" }`.

   - Якщо `message.type === "EVENT_TRANSCRIPT" / "EVENT_STATE_CHANGE" / "EVENT_ERROR"` **від Engine**:

     - дивитись на `message.tabId` і переслати в `chrome.tabs.sendMessage(tabId, message)`.

### 2.5. Вмикаємо Web Speech API в `engine.js`

На цьому кроці переносимо логіку з `content-script.js`/`dictation.js` у `engine.js`, але _не вставляємо текст_ — лише шлемо `EVENT_TRANSCRIPT`.

1. У `engine.js`:

   - Створити `getSpeechRecognitionCtor()` як у старому content-script.
   - Реалізувати `startEngineSession({ tabId })`:

     - створити `new SpeechRecognition()`;
     - `continuous = true`, `interimResults = true`, `lang = "uk-UA"`;
     - в `onresult` формувати текст і слати в background:

       ```js
       chrome.runtime.sendMessage({
         type: "EVENT_TRANSCRIPT",
         text: finalText,
         isFinal: res.isFinal,
         tabId: currentTabId,
       });
       ```

   - Реалізувати `stopEngineSession()` — зупинити recognition.

2. `onMessage` в Engine:

   - на `CMD_START_SESSION` зберігати `currentTabId` і запускати `startEngineSession(...)`;
   - на `CMD_STOP_SESSION` — зупиняти.

---

## 3. Етап 3 — Вставка тексту + авто-завершення

**Ціль:** диктуємо → текст з’являється у віджеті → при `isFinal=true` він вставляється у поле вводу й сесія закінчується (або по таймауту тиші).

### 3.1. `input-simulator.js`: безпечна вставка тексту

На базі поточного коду `insertTextToActiveElement`/GET/SET_TEXT.

1. Виділити чисті функції:

   ```js
   export function getActiveEditableElement() { … }

   export function appendText(text) { … }

   export function replaceText(text) { … }
   ```

   - `appendText` — додати текст у кінець (як зараз в диктації).
   - `replaceText` — повністю замінити вміст (для сценарію з GPT-чисткою).

2. У цих функціях гарантовано кидати:

   ```js
   el.dispatchEvent(new Event("input", { bubbles: true }));
   ```

   Щоб React/Vue побачили зміну.

### 3.2. Host обробляє `EVENT_TRANSCRIPT`

У `content/content.js`:

1. У `chrome.runtime.onMessage`:

   - Якщо `type === "EVENT_TRANSCRIPT"`:

     - `widget.updateText(message.text, message.isFinal)`;
     - якщо `isFinal === true`:

       - викликати `appendText` або `replaceText` (залежно від UX, який хочеш);
       - викликати `widget.hide()`;
       - відправити назад у background `CMD_STOP_SESSION_FROM_HOST`.

2. Додати обробку `EVENT_ERROR` → `widget.showError(message.message)`.

### 3.3. Детектор тиші (Auto-timeout) у Engine

У `engine.js`:

1. Після `recognition.start()` завести таймер:

   ```js
   let silenceTimer = null;

   function armSilenceTimer() {
     clearTimeout(silenceTimer);
     silenceTimer = setTimeout(() => {
       // самі себе стопаємо
       stopEngineSession({ reason: "silence" });
     }, 2500); // 2.5 сек тиші
   }
   ```

2. Викликати `armSilenceTimer()`:

   - у `onstart`;
   - в `onresult` після кожної події (тільки якщо були нові результати).

3. У `stopEngineSession`:

   - відправити в background `EVENT_STATE_CHANGE` зі статусом `"idle"`;
   - якщо є накопичений останній текст — надіслати `EVENT_TRANSCRIPT` з `isFinal=true` (як fallback, якщо останній івент був тільки interim).

---

## 4. Етап 4 — Полірування та інтеграція з існуючим /process

**Ціль:** зробити з цього приємний продакшен-інструмент і не втратити твій поточний GPT-бекенд.

### 4.1. Іконка, badge, стани

У `background/service-worker.js`:

1. Додати маленький менеджер стану:

   ```js
   let isDictating = false;

   function setActionState(state) {
     if (state === "on") {
       chrome.action.setBadgeText({ text: "ON" });
     } else {
       chrome.action.setBadgeText({ text: "" });
     }
   }
   ```

2. Міняти стан:

   - на `CMD_START_SESSION` → `isDictating = true`, `setActionState("on")`;
   - на `EVENT_STATE_CHANGE` `"idle"` або при помилці → `isDictating = false`, `setActionState("off")`.

3. Пізніше можна підключити різні іконки (`assets/icon-mic-on.png`, `icon-mic-err.png`) з `chrome.action.setIcon(...)`.

### 4.2. Popup → вибір мови для Engine

Зараз popup тільки відкриває dictation.html.

1. Переробити popup:

   - Зробити простий select:

     - `uk-UA`
     - `en-US`
     - (пізніше: інші).

   - Зберігати вибір у `chrome.storage.sync` (ти вже так робиш для режиму `/process`).

2. Engine при старті сесії дістає мову з `chrome.storage.sync` і встановлює `recognition.lang`.

### 4.3. Інтегрувати поточний `/process` (опціонально як Етап 5)

Щоб не загубити твою сильну сторону — GPT-чистку:

1. Додати опцію в popup:

   - чекбокс “Після диктування проходити через GPT-cleaner”.

2. Якщо вона увімкнена, то після `EVENT_TRANSCRIPT (isFinal=true)` content **не одразу вставляє текст**, а:

   - посилає в background `CMD_CLEAN_TEXT` з текстом.

3. Background використовує наявну логіку `/health` + `/process` для обробки тексту й повертає чистий текст назад у content через нове повідомлення `EVENT_CLEANED_TEXT`.
4. Content вставляє вже оброблений текст у поле.

---

## 5. Як цим користуватись як чеклістом

Я б розбив роботу так:

1. **PR 1 — refactor структури + engine.html v0:**

   - пункти 1.1–1.4.

2. **PR 2 — протокол повідомлень + Web Speech в Engine (без вставки):**

   - 2.1–2.5 (до `EVENT_TRANSCRIPT`).

3. **PR 3 — Widget + вставка тексту + auto-timeout:**

   - 3.1–3.3.

4. **PR 4 — UX-polish + popup мови + (опційно) GPT-clean після диктації:**

   - 4.1–4.3.

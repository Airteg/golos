// test/harness.js

// 1. ІМПОРТ РЕАЛЬНОГО КОДУ (Це працює тільки тут, у JS файлі)
import { insertText, getActiveEditable } from "../content/input-simulator.js";

// Робимо функції доступними глобально для налагодження в консолі (якщо треба)
window.insertText = insertText;
window.getActiveEditable = getActiveEditable;

(function () {
  const $ = (sel) => document.querySelector(sel);
  const inputEl = $("input[type='text']");
  const taEl = $("textarea");
  const ceEl = $(".editable");

  function setCursorEnd(el) {
    el.focus();
    if (el.selectionStart !== undefined) {
      const n = el.value.length;
      el.selectionStart = el.selectionEnd = n;
    } else if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function setValue(el, v) {
    if (el.value !== undefined) el.value = v;
    else el.innerText = v;
    setCursorEnd(el);
  }

  const cases = [
    {
      name: "Leading space from STT",
      base: "Привіт",
      ins: " привіт",
      expect: "Привіт привіт",
    },
    { name: "Comma", base: "Привіт", ins: ",", expect: "Привіт," },
    { name: "Open paren", base: "(", ins: "тест", expect: "(тест" },
    {
      name: "After newline",
      base: "Привіт\n",
      ins: "як",
      expect: "Привіт\nяк",
    },
    { name: "Close paren", base: "Привіт", ins: ")", expect: "Привіт)" },
  ];

  function readValue(el) {
    return el.value !== undefined ? el.value : el.innerText;
  }

  function runOn(el, label) {
    console.group(`RUN ${label}`);
    for (const tc of cases) {
      setValue(el, tc.base);

      // ВИКЛИКАЄМО ІМПОРТОВАНУ ФУНКЦІЮ
      insertText(el, tc.ins);

      const got = readValue(el);
      const ok = got === tc.expect;
      console.log(`${ok ? "✅" : "❌"} ${tc.name}`, {
        base: tc.base,
        ins: tc.ins,
        got,
        expect: tc.expect,
      });
    }
    console.groupEnd();
  }

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:99999;background:#111;color:#fff;padding:10px;border-radius:10px;font:12px/1.3 system-ui;";
  panel.innerHTML = `
    <div style="margin-bottom:8px;font-weight:600;">Golos Tests</div>
    <button id="tInput">Set INPUT</button>
    <button id="tTA">Set TEXTAREA</button>
    <button id="tCE">Set CE</button>
    <button id="tRun" style="margin-left:8px;">Run tests</button>
  `;
  document.body.appendChild(panel);

  panel
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.style.cssText =
          "margin:2px;padding:6px 8px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;cursor:pointer;")
    );

  panel.querySelector("#tInput").onclick = () => {
    setValue(inputEl, "");
    setCursorEnd(inputEl);
    console.log("Active: INPUT");
  };
  panel.querySelector("#tTA").onclick = () => {
    setValue(taEl, "");
    setCursorEnd(taEl);
    console.log("Active: TEXTAREA");
  };
  panel.querySelector("#tCE").onclick = () => {
    setValue(ceEl, "");
    setCursorEnd(ceEl);
    console.log("Active: CE");
  };
  panel.querySelector("#tRun").onclick = () => {
    runOn(inputEl, "INPUT");
    runOn(taEl, "TEXTAREA");
    runOn(ceEl, "CONTENTEDITABLE");
  };

  console.log(
    "✅ Harness Loaded. Logic imported from content/input-simulator.js"
  );
})();

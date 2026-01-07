import { insertText, getActiveEditable } from "../content/input-simulator.js";

// Expose logic
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
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // === CE: детерміноване формування DOM + детермінована позиція курсора ===
  function setValueCE(el, v) {
    el.innerHTML = "";
    el.focus();

    const parts = v.split("\n");

    // Будуємо DOM: TextNode + <br> + TextNode ...
    parts.forEach((p, i) => {
      el.appendChild(document.createTextNode(p)); // важливо: додаємо навіть порожній
      if (i < parts.length - 1) el.appendChild(document.createElement("br"));
    });

    const sel = window.getSelection();
    const range = document.createRange();

    // Якщо є хоча б один перенос — ставимо курсор на початок другої "лінії"
    // (тобто після <br>, перед другим TextNode).
    // Так ми тестуємо саме "після newline" в реальній позиції каретки.
    if (parts.length > 1) {
      // Структура гарантована нашим генератором:
      // [TextNode(line0), <br>, TextNode(line1), <br>, TextNode(line2) ...]
      const secondTextNode = el.childNodes[2]; // 0=text, 1=br, 2=text
      range.setStart(secondTextNode, 0);
      range.collapse(true);
    } else {
      // Стандартна поведінка — в кінець
      range.selectNodeContents(el);
      range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }

  function setValue(el, v) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = v;
      setCursorEnd(el);
    } else {
      setValueCE(el, v);
    }
  }

  // === Надійне читання CE DOM замість innerText ===
  function readValueCE(el) {
    let out = "";
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.textContent;
      } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "BR") {
        out += "\n";
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        out += n.textContent;
      }
    }
    return out;
  }

  function readValue(el) {
    if (el.value !== undefined) return el.value;
    return readValueCE(el);
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

    // ✅ НОВИЙ детермінований кейс для CE/TEXTAREA:
    // newline НЕ в кінці, а між двома текстовими частинами.
    // Для CE курсор ставиться на початок другої лінії (після <br>).
    {
      name: "After newline",
      base: "Привіт\nтут",
      ins: "як ",
      expect: "Привіт\nяк тут",
    },

    { name: "Close paren", base: "Привіт", ins: ")", expect: "Привіт)" },
  ];

  const casesFor = (el) => {
    if (el instanceof HTMLInputElement) {
      return cases.filter((c) => c.name !== "After newline");
    }
    return cases;
  };

  function runOn(el, label) {
    console.group(`RUN ${label}`);
    for (const tc of casesFor(el)) {
      setValue(el, tc.base);
      insertText(el, tc.ins);

      const got = readValue(el);

      if (label === "CONTENTEDITABLE" && tc.name === "After newline") {
        console.log("[CE DEBUG HTML]", el.innerHTML.replace(/<br>/g, "<br>⏎"));
      }

      const normGot = got.replace(/\r\n/g, "\n");
      const ok = normGot === tc.expect;

      console.log(`${ok ? "✅" : "❌"} ${tc.name}`, {
        base: tc.base,
        ins: tc.ins,
        got: normGot,
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

  panel.querySelectorAll("button").forEach((b) => {
    b.style.cssText =
      "margin:2px;padding:6px 8px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;cursor:pointer;";
  });

  panel.querySelector("#tInput").onclick = () => {
    setValue(inputEl, "");
    console.log("Active: INPUT");
  };
  panel.querySelector("#tTA").onclick = () => {
    setValue(taEl, "");
    console.log("Active: TEXTAREA");
  };
  panel.querySelector("#tCE").onclick = () => {
    setValue(ceEl, "");
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

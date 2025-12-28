// test/utils.js

// 1. Logger
(function () {
  const show = (s) => String(s).replace(/ /g, "␠").replace(/\n/g, "\\n");

  function describe(el) {
    if (!el) return "null";
    return (
      `${el.tagName}${el.id ? "#" + el.id : ""}${
        el.className
          ? "." + String(el.className).trim().replace(/\s+/g, ".")
          : ""
      }` + (el.isContentEditable ? "[contenteditable]" : "")
    );
  }

  function getValueLike(el) {
    if (!el) return null;
    if (el.value !== undefined) return el.value;
    if (el.isContentEditable) return el.innerText;
    return null;
  }

  function getSelLike(el) {
    if (!el) return null;
    if (el.selectionStart !== undefined)
      return { start: el.selectionStart, end: el.selectionEnd };
    const sel = window.getSelection?.();
    return sel ? { text: String(sel), rangeCount: sel.rangeCount } : null;
  }

  const events = [
    "beforeinput",
    "input",
    "keydown",
    "keyup",
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ];
  const opts = { capture: true };

  events.forEach((type) => {
    document.addEventListener(
      type,
      (e) => {
        const el = document.activeElement;
        const rec = {
          type,
          target: describe(e.target),
          active: describe(el),
          inputType: e.inputType || null,
          data: e.data != null ? show(e.data) : null,
          key: e.key || null,
          code: e.code || null,
          isComposing: e.isComposing ?? null,
          valueLike: show(getValueLike(el) ?? ""),
          sel: getSelLike(el),
        };
        if (type === "keyup") return;
        console.log("[FIELD-EVENT]", rec);
      },
      opts
    );
  });
  console.log("Field event logger installed.");
})();

// 2. Hooks
(function () {
  const show = (s) => String(s).replace(/ /g, "␠").replace(/\n/g, "\\n");
  const log = (name, payload) => {
    console.log(`[INSERT-HOOK] ${name}`, payload);
  };

  const patchValueSetter = (proto, label) => {
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (!desc || !desc.set || !desc.get) return;

    Object.defineProperty(proto, "value", {
      get: desc.get,
      set(v) {
        log(`${label}.value=`, { el: this, v: show(v) });
        return desc.set.call(this, v);
      },
      configurable: true,
      enumerable: desc.enumerable,
    });
  };

  patchValueSetter(HTMLInputElement.prototype, "HTMLInputElement");
  patchValueSetter(HTMLTextAreaElement.prototype, "HTMLTextAreaElement");

  const origSetRangeText = HTMLInputElement.prototype.setRangeText;
  if (origSetRangeText) {
    HTMLInputElement.prototype.setRangeText = function (...args) {
      log("HTMLInputElement.setRangeText", { el: this, args });
      return origSetRangeText.apply(this, args);
    };
  }
  const origSetRangeTextTA = HTMLTextAreaElement.prototype.setRangeText;
  if (origSetRangeTextTA) {
    HTMLTextAreaElement.prototype.setRangeText = function (...args) {
      log("HTMLTextAreaElement.setRangeText", { el: this, args });
      return origSetRangeTextTA.apply(this, args);
    };
  }

  const origExec = document.execCommand?.bind(document);
  if (origExec) {
    document.execCommand = function (cmd, ui, val) {
      log("document.execCommand", {
        cmd,
        ui,
        val: val != null ? show(val) : val,
      });
      return origExec(cmd, ui, val);
    };
  }

  const origDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    if (ev && (ev.type === "input" || ev.type === "beforeinput")) {
      log("dispatchEvent", {
        target: this,
        type: ev.type,
        isInputEvent: ev instanceof InputEvent,
        inputType: ev.inputType || null,
        data: ev.data != null ? show(ev.data) : null,
      });
    }
    return origDispatch.call(this, ev);
  };

  console.log("Insert hooks installed.");
})();

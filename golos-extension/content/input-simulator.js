export function getActiveEditable() {
  const el = document.activeElement;
  if (!el) return null;

  const isInput =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  const isContentEditable = el.isContentEditable;

  if (isInput || isContentEditable) {
    return el;
  }
  return null;
}

export function insertText(el, text) {
  if (!el || !text) return;

  const isInput =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

  if (isInput) {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const originalValue = el.value;

    const prefix = originalValue.substring(0, start);
    const suffix = originalValue.substring(end);

    const spacer = prefix.length > 0 && !prefix.endsWith(" ") ? " " : "";

    el.value = prefix + spacer + text + suffix;

    const newCursorPos = start + spacer.length + text.length;
    el.selectionStart = el.selectionEnd = newCursorPos;

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // Для contenteditable
    document.execCommand("insertText", false, text);
  }
  console.log("[Golos Input] Inserted:", text);
}

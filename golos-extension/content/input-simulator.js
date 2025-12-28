export function getActiveEditable() {
  const el = document.activeElement;
  if (!el) return null;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
      if (typeof el.selectionStart === "number") return el;
    } catch (e) {
      return null;
    }
  }

  if (el.isContentEditable) {
    return el;
  }
  return null;
}

// === ЛОГІКА ОБХОДУ DOM ===

function lastCharInNode(node) {
  if (!node) return null;

  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent || "";
    return t.length ? t[t.length - 1] : null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node;
    if (el.tagName === "BR") return "\n";

    // Проходимо по дітях з кінця до початку
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const ch = lastCharInNode(el.childNodes[i]);
      if (ch != null) return ch;
    }
  }
  return null;
}

function getCharBeforeCursorCE(rootEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const r = sel.getRangeAt(0);
  let node = r.startContainer;
  const offset = r.startOffset;

  // 1. Швидкий шлях: курсор всередині тексту
  if (node.nodeType === Node.TEXT_NODE && offset > 0) {
    return node.textContent[offset - 1] ?? null;
  }

  // 2. Курсор між вузлами елемента
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const prev = node.childNodes[offset - 1];
    const ch = lastCharInNode(prev);
    if (ch != null) return ch;
  }

  // 3. Fallback: йдемо назад по дереву
  while (node && node !== rootEl) {
    let prev = node.previousSibling;
    while (prev) {
      const ch = lastCharInNode(prev);
      if (ch != null) return ch;
      prev = prev.previousSibling;
    }
    node = node.parentNode;
  }

  return null;
}

function getCharBeforeCursor(el) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart || 0;
    if (start === 0) return null;
    return el.value[start - 1];
  } else if (el.isContentEditable) {
    return getCharBeforeCursorCE(el);
  }
  return null;
}

export function insertText(el, text) {
  if (!el || !text) return;

  // 1. Нормалізація
  let cleanText = text;
  if (cleanText.trim().length > 0) {
    cleanText = cleanText.trimStart();
  }

  // 2. Аналіз контексту
  let charBefore = getCharBeforeCursor(el);
  if (charBefore === "\u00A0") charBefore = " ";

  console.log(
    `[Golos Logic] PrevChar: '${charBefore === "\n" ? "\\n" : charBefore}'`
  );

  const isNewline = charBefore === "\n" || charBefore === "\r";
  const isSpaceBefore = charBefore === " ";
  const isStart = charBefore === null;

  const noSpaceAfterChars = new Set([
    "(",
    "[",
    "{",
    "<",
    "«",
    "“",
    '"',
    "„",
    "‹",
    "'",
    "\n",
    "\r",
  ]);

  // ПРАВКА: Прибрали тире з regex, бо є окрема перевірка startsWithDash
  const noLeadingSpaceTokens = /^[\s]*[.,!?:;)\]}»”"…>]/;
  const startsWithDash = /^[\s]*[—-]/.test(cleanText);

  const isPunctuationOrClosing = noLeadingSpaceTokens.test(cleanText);
  const isAfterNoSpaceChar =
    charBefore != null && noSpaceAfterChars.has(charBefore);

  let spacer = "";
  if (
    !isStart &&
    !isSpaceBefore &&
    !isNewline &&
    !isAfterNoSpaceChar &&
    !isPunctuationOrClosing &&
    !startsWithDash
  ) {
    spacer = " ";
  }

  const textToInsert = spacer + cleanText;

  // 3. Вставка
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const val = el.value;

    el.value = val.substring(0, start) + textToInsert + val.substring(end);
    el.selectionStart = el.selectionEnd = start + textToInsert.length;

    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: textToInsert,
    });
    el.dispatchEvent(inputEvent);

    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand("insertText", false, textToInsert);
  }

  console.log(
    `[Golos Input] Inserted: '${textToInsert}' (Spacer: ${
      spacer ? "YES" : "NO"
    })`
  );
}

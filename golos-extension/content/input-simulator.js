export function getActiveEditable() {
  const el = document.activeElement;
  if (!el) return null;

  // Підтримка стандартних полів
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    try {
      // Перевірка, чи підтримує елемент selectionStart (виключаємо checkbox, range тощо)
      if (typeof el.selectionStart === "number") return el;
    } catch (e) {
      return null;
    }
  }

  // Підтримка contenteditable
  if (el.isContentEditable) {
    return el;
  }

  return null;
}

// Допоміжна функція: отримати символ перед курсором
function getCharBeforeCursor(el) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart || 0;
    if (start === 0) return null; // Початок поля
    return el.value[start - 1];
  } else if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0).cloneRange();
      try {
        // Спроба розширити виділення на 1 символ назад
        range.setStart(
          range.startContainer,
          Math.max(0, range.startOffset - 1)
        );
        const text = range.toString();

        if (text.length === 1) return text;

        // Фоллбек: перевіряємо текст ноди напряму, якщо range не спрацював
        const node = sel.anchorNode;
        if (node && node.nodeType === 3 && sel.anchorOffset > 0) {
          return node.textContent[sel.anchorOffset - 1];
        }
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

export function insertText(el, text) {
  if (!el || !text) return;

  // 1. Нормалізація вхідного тексту
  // Прибираємо початковий пробіл від Chrome, бо ми керуємо відступами самі
  let cleanText = text;
  if (cleanText.trim().length > 0) {
    cleanText = cleanText.trimStart();
  }

  // 2. Аналіз контексту (символ зліва)
  const charBefore = getCharBeforeCursor(el);

  // === ТВОЯ ЛОГІКА SMART SPACING ===

  const isNewline = charBefore === "\n" || charBefore === "\r";
  const isSpaceBefore = charBefore === " " || charBefore === "\u00A0"; // Space або NBSP
  const isStart = charBefore === null;

  // Символи, після яких пробіл НЕ ставимо (відкриваючі дужки, лапки, початок рядка)
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

  // Пунктуація, перед якою пробіл НЕ додаємо (коми, крапки, закриваючі дужки)
  // Додав також крапку, знаки питання/оклику, щоб уникнути "слово ."
  const noLeadingSpaceTokens = /^[\s]*[.,!?:;)\]}»”"…>]/;

  // Окремо: якщо вставляємо тире/дефіс — не додаємо примусовий пробіл перед ним
  const startsWithDash = /^[\s]*[—-]/.test(cleanText);

  const isPunctuationOrClosing = noLeadingSpaceTokens.test(cleanText);
  const isAfterNoSpaceChar =
    charBefore != null && noSpaceAfterChars.has(charBefore);

  // Вирішуємо, чи потрібен пробіл
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
  // =================================

  const textToInsert = spacer + cleanText;

  // 3. Вставка тексту
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const originalValue = el.value;

    const prefix = originalValue.substring(0, start);
    const suffix = originalValue.substring(end);

    el.value = prefix + textToInsert + suffix;

    const newCursorPos = start + textToInsert.length;
    el.selectionStart = el.selectionEnd = newCursorPos;

    // Тригеримо події для фреймворків
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // Contenteditable: використовуємо execCommand для undo/redo
    document.execCommand("insertText", false, textToInsert);
  }

  console.log(
    `[Golos Input] Inserted: '${textToInsert}' (Spacer: ${
      spacer ? "YES" : "NO"
    }, PrevChar: '${charBefore}')`
  );
}

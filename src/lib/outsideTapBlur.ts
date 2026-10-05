const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const KEEPS_FOCUS = `${EDITABLE}, button, a[href], label, [role="button"], [role="menu"], [role="menuitem"], [role="option"], [role="slider"], .text-selection-tools`;

// iOS WebKit keeps the caret in a text box when tapping a non-focusable area, so blur it ourselves.
export function watchOutsideTapBlur() {
  const onPointerDown = (event: PointerEvent) => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !focused.matches(EDITABLE)) return;
    const target = event.target;
    if (target instanceof Node && focused.contains(target)) return;
    if (target instanceof Element && target.closest(KEEPS_FOCUS)) return;
    const selection = window.getSelection();
    if (selection?.anchorNode && focused.contains(selection.anchorNode)) selection.removeAllRanges();
    focused.blur();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  return () => document.removeEventListener('pointerdown', onPointerDown, true);
}

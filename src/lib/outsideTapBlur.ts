const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const KEEPS_FOCUS = `${EDITABLE}, button, a[href], label, [role="button"], [role="menu"], [role="menuitem"], [role="option"], [role="slider"], .text-selection-tools`;

function focusedEditable() {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused.matches(EDITABLE) ? focused : null;
}

function isOutside(editable: HTMLElement, target: EventTarget | null) {
  if (target instanceof Node && editable.contains(target)) return false;
  return !(target instanceof Element && target.closest(KEEPS_FOCUS));
}

function dismiss(editable: HTMLElement) {
  const selection = window.getSelection();
  if (selection?.anchorNode && editable.contains(selection.anchorNode)) selection.removeAllRanges();
  editable.blur();
}

// Tapping or clicking outside a text box removes its caret. iOS WebKit keeps focus on taps over
// non-focusable areas, and Blink/WebKit snap the caret back into the nearest editable text when
// the click lands on empty page space, so the browser's default mousedown action is cancelled too.
export function watchOutsideTapBlur() {
  let dismissing = false;
  const onPointerDown = (event: PointerEvent) => {
    const editable = focusedEditable();
    dismissing = Boolean(editable && isOutside(editable, event.target));
    if (editable && dismissing) dismiss(editable);
  };
  const onMouseDown = (event: MouseEvent) => {
    if (dismissing && !(event.target instanceof Element && event.target.closest(KEEPS_FOCUS))) event.preventDefault();
  };
  const onClick = (event: MouseEvent) => {
    if (!dismissing) return;
    dismissing = false;
    const editable = focusedEditable();
    if (editable && isOutside(editable, event.target)) dismiss(editable);
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('click', onClick, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('click', onClick, true);
  };
}

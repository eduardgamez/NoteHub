export type SidePanel = 'sidebar' | 'ai';

const PANELS: Record<SidePanel, string> = { sidebar: '.project-sidebar', ai: '.ai-panel' };
// Taps here belong to the panels (their toggles, menus and popovers), so they never close them.
const KEEPS_OPEN = '.project-sidebar, .ai-panel, .project-sidebar-toggle, .ai-panel-toggle, .project-context-menu, .text-selection-tools, [role="menu"], [role="dialog"]';
const OVERLAY = '(max-width: 820px)';
const SWIPE_DISTANCE = 60;

function openPanels() {
  return (Object.keys(PANELS) as SidePanel[]).filter((panel) => document.querySelector(PANELS[panel]));
}

function scrollsSideways(target: EventTarget | null, panel: Element) {
  for (let element = target instanceof Element ? target : null; element && element !== panel; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && element.scrollWidth > element.clientWidth + 1) return true;
  }
  return false;
}

// On narrow screens the explorer and AI panels float over the document: tapping outside them closes
// them, swallowing that tap so it doesn't also act on what's underneath. Swiping a panel back toward
// its edge (left for the explorer, right for the AI) closes it on any screen.
export function watchPanelDismiss(close: (panel: SidePanel) => void) {
  let swallowClick = false;
  let swipe: { panel: SidePanel; x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    swallowClick = false;
    if (!window.matchMedia(OVERLAY).matches) return;
    if (event.target instanceof Element && event.target.closest(KEEPS_OPEN)) return;
    const open = openPanels();
    if (!open.length) return;
    open.forEach(close);
    swallowClick = true;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest(KEEPS_OPEN)) focused.blur();
  };
  const onMouseDown = (event: MouseEvent) => { if (swallowClick) event.preventDefault(); };
  const onClick = (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onTouchStart = (event: TouchEvent) => {
    swipe = null;
    if (event.touches.length !== 1 || !(event.target instanceof Element)) return;
    const panel = (Object.keys(PANELS) as SidePanel[]).find((name) => (event.target as Element).closest(PANELS[name]));
    if (!panel || scrollsSideways(event.target, event.target.closest(PANELS[panel])!)) return;
    swipe = { panel, x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!swipe || event.touches.length) return;
    const { panel, x, y } = swipe;
    swipe = null;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - x;
    const dy = touch.clientY - y;
    const towardEdge = panel === 'sidebar' ? -dx : dx;
    const selection = window.getSelection();
    if (towardEdge >= SWIPE_DISTANCE && towardEdge > Math.abs(dy) * 1.5 && (!selection || selection.isCollapsed)) close(panel);
  };
  const onTouchCancel = () => { swipe = null; };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('touchstart', onTouchStart, true);
    document.removeEventListener('touchend', onTouchEnd, true);
    document.removeEventListener('touchcancel', onTouchCancel, true);
  };
}

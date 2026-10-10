import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

type Panel = 'sidebar' | 'ai';

const LIMITS: Record<Panel, [number, number]> = { sidebar: [180, 560], ai: [260, 760] };
const VARS: Record<Panel, string> = { sidebar: '--project-sidebar-w', ai: '--ai-panel-w' };
const STORAGE: Record<Panel, string> = { sidebar: 'notehub.panelWidth.sidebar', ai: 'notehub.panelWidth.ai' };
const MIN_WORKSPACE = 360;

export function savedPanelWidths() {
  const style: Record<string, string> = {};
  (Object.keys(VARS) as Panel[]).forEach((panel) => {
    try {
      const width = Number(localStorage.getItem(STORAGE[panel]));
      if (width >= LIMITS[panel][0] && width <= LIMITS[panel][1]) style[VARS[panel]] = `${width}px`;
    } catch { /* storage unavailable */ }
  });
  return style;
}

/** VS Code-style drag handle that changes a side panel's width on desktop. Double-click restores the default width. */
export function PanelResizer({ panel }: { panel: Panel }) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const layout = handle.parentElement;
    if (!layout) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    document.documentElement.classList.add('panel-resizing');
    const other = panel === 'sidebar' ? 'ai' : 'sidebar';
    let width = 0;
    const onMove = (move: PointerEvent) => {
      const rect = layout.getBoundingClientRect();
      const otherWidth = layout.querySelector(other === 'ai' ? ':scope > .ai-panel' : ':scope > .project-sidebar')?.getBoundingClientRect().width ?? 0;
      const raw = panel === 'sidebar' ? move.clientX - rect.left : rect.right - move.clientX;
      const [min, max] = LIMITS[panel];
      width = Math.round(Math.max(min, Math.min(max, rect.width - otherWidth - MIN_WORKSPACE, raw)));
      layout.style.setProperty(VARS[panel], `${width}px`);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      handle.classList.remove('dragging');
      document.documentElement.classList.remove('panel-resizing');
      if (width) try { localStorage.setItem(STORAGE[panel], String(width)); } catch { /* storage unavailable */ }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };
  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.currentTarget.parentElement?.style.removeProperty(VARS[panel]);
    try { localStorage.removeItem(STORAGE[panel]); } catch { /* storage unavailable */ }
  };
  return <div className={`panel-resizer resize-${panel}`} role="separator" aria-orientation="vertical" aria-label={panel === 'sidebar' ? 'Resize project explorer' : 'Resize AI panel'} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} />;
}

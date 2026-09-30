import { useLayoutEffect, useRef, useState } from 'react';
import { Check, GripVertical, Plus, X } from 'lucide-react';
import type { ChecklistEntry } from '../../types';

export function EditableTaskList({ items, onChange }: { items: ChecklistEntry[]; onChange: (items: ChecklistEntry[]) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const order = useRef(items);
  useLayoutEffect(() => { order.current = items; }, [items]);

  const move = (from: string, to: string) => {
    const current = order.current;
    const source = current.findIndex((item) => item.id === from);
    const target = current.findIndex((item) => item.id === to);
    if (source < 0 || target < 0 || source === target) return;
    const next = [...current];
    const [item] = next.splice(source, 1);
    next.splice(target, 0, item);
    order.current = next;
    onChange(next);
  };
  const add = () => onChange([...items, { id: crypto.randomUUID(), text: '', done: false }]);

  return <div className="reminder-editor-list"
    onPointerMove={(event) => {
      if (!dragging) return;
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-task-id]');
      if (row?.dataset.taskId && event.currentTarget.contains(row)) move(dragging, row.dataset.taskId);
      const popup = event.currentTarget.closest<HTMLElement>('.reminder-popover');
      if (popup) {
        const bounds = popup.getBoundingClientRect();
        if (event.clientY < bounds.top + 32) popup.scrollTop -= 12;
        else if (event.clientY > bounds.bottom - 32) popup.scrollTop += 12;
      }
    }}
    onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} onLostPointerCapture={() => setDragging(null)}>
    {items.map((item) => <div className={`reminder-editor-task ${dragging === item.id ? 'dragging' : ''}`} data-task-id={item.id} key={item.id}>
      <button type="button" className="reminder-task-drag" aria-label={`Mover tarea ${item.text || 'sin título'}`} title="Arrastrar para cambiar el orden"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          // Capture on the stable list: moving a row in the DOM releases that row's pointer capture.
          event.currentTarget.closest('.reminder-editor-list')?.setPointerCapture(event.pointerId);
          setDragging(item.id);
        }}
        onKeyDown={(event) => {
          const index = items.findIndex((entry) => entry.id === item.id);
          const target = event.key === 'ArrowUp' ? items[index - 1] : event.key === 'ArrowDown' ? items[index + 1] : undefined;
          if (target) { event.preventDefault(); move(item.id, target.id); }
        }}><GripVertical size={13} /></button>
      <button type="button" className={`reminder-task-check ${item.done ? 'done' : ''}`} role="checkbox" aria-checked={item.done} aria-label={item.text || 'Tarea sin título'} onClick={() => onChange(items.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry))}>{item.done && <Check size={13} />}</button>
      <input aria-label={`Título de tarea ${item.id}`} value={item.text} placeholder="Tarea" className={item.done ? 'done' : ''} autoFocus={!item.text} onChange={(event) => onChange(items.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
      <button type="button" className="reminder-task-remove" aria-label={`Eliminar tarea ${item.text || 'sin título'}`} onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}><X size={14} /></button>
    </div>)}
    <button type="button" className="reminder-add-task" onClick={add}><Plus size={14} />Añadir tarea</button>
  </div>;
}

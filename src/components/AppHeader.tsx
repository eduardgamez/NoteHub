import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Laptop, Moon, Search, Settings, Sun, X } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { useTheme } from '../hooks/useTheme';

export function AppHeader() {
  const notes = useWorkspace((state) => state.notes);
  const setActiveNote = useWorkspace((state) => state.setActiveNote);
  const setActiveView = useWorkspace((state) => state.setActiveView);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const { theme, followsSystem, chooseTheme, useSystemTheme: restoreSystemTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const results = query.trim() ? Object.values(notes).filter((note) => note.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 8) : [];

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchRef.current?.contains(event.target)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  function cycleTheme() {
    if (followsSystem) chooseTheme('light');
    else if (theme === 'light') chooseTheme('dark');
    else restoreSystemTheme();
  }

  return <header className="app-header">
    <button className="header-brand" onClick={() => { setActiveView('calendar'); setAiOpen(false); }} aria-label="NoteHub home"><span className="brand-mark">N</span><strong>NoteHub</strong></button>
    <div ref={searchRef} className="header-search"><Search size={17} /><input type="search" aria-label="Search in notes" placeholder="Search in notes…" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
      {searchOpen && query.trim() && <div className="header-search-results">{results.length ? results.map((note) => <button key={note.id} onClick={() => { setActiveNote(note.id); setAiOpen(window.innerWidth > 820); setQuery(''); setSearchOpen(false); }}><span>{note.emoji}</span><span>{note.title}</span></button>) : <p>No notes found</p>}</div>}
    </div>
    <div className="header-actions">
      <button onClick={() => setActiveView('settings')} aria-label="Settings" title="Settings"><Settings size={20} /></button>
      <button onClick={() => setHelpOpen(!helpOpen)} aria-label="Help" title="Help"><CircleHelp size={20} /></button>
      <button onClick={cycleTheme} aria-label="Change theme" title={followsSystem ? 'System theme' : `${theme} theme`}>{followsSystem ? <Laptop size={20} /> : theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}</button>
    </div>
    {helpOpen && <div className="header-help"><strong>Quick help</strong><p>Open a project to view its notes. Search by note title above. In a document, use the toolbar to add content or draw.</p><button onClick={() => setHelpOpen(false)}>Close</button></div>}
  </header>;
}

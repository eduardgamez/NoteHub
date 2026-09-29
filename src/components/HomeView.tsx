import { useCallback, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { Project } from '../types';
import { AIChat } from './AIChat';
import { CalendarView } from './modules/CalendarView';

function projectEmoji(project: Project) {
  return project.id === 'gym' && project.emoji === '◒' ? '🏋️' : project.emoji;
}

export function HomeView() {
  const projects = useWorkspace((state) => state.projects);
  const addProject = useWorkspace((state) => state.addProject);
  const updateProject = useWorkspace((state) => state.updateProject);
  const removeProject = useWorkspace((state) => state.removeProject);
  const openProject = useWorkspace((state) => state.openProject);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [mode, setMode] = useState<'open' | 'edit' | 'delete'>('open');
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; emoji: string }>>({});
  const controlsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const emojiNodesRef = useRef<Record<string, HTMLSpanElement | null>>({});
  const visibleProjects = newProjectId ? [...projects, { id: newProjectId, title: '', emoji: '', context: [] }] : projects;

  function beginInlineEdit() {
    setDrafts(Object.fromEntries(projects.map((project) => [project.id, { title: project.title, emoji: projectEmoji(project) }])));
    setMode('edit');
  }

  function beginNewProject() {
    if (newProjectId) {
      gridRef.current?.querySelector<HTMLElement>('[data-new-project="true"] .project-inline-emoji')?.focus();
      return;
    }
    const id = crypto.randomUUID();
    setDrafts((current) => ({
      ...(mode === 'edit' ? current : Object.fromEntries(projects.map((project) => [project.id, { title: project.title, emoji: projectEmoji(project) }]))),
      [id]: { title: '', emoji: '' },
    }));
    setNewProjectId(id);
    setMode('edit');
  }

  const finishInlineEdit = useCallback(() => {
    for (const project of projects) {
      const draft = drafts[project.id];
      if (!draft) continue;
      const nextTitle = draft.title.trim() || project.title;
      const nextEmoji = emojiNodesRef.current[project.id]?.textContent?.trim() || projectEmoji(project);
      if (nextTitle !== project.title || nextEmoji !== project.emoji) updateProject({ ...project, title: nextTitle, emoji: nextEmoji });
    }
    const newDraft = newProjectId ? drafts[newProjectId] : null;
    const newEmoji = newProjectId ? emojiNodesRef.current[newProjectId]?.textContent?.trim() : '';
    if (newProjectId && newDraft?.title.trim() && newEmoji) {
      addProject({ id: newProjectId, title: newDraft.title.trim(), emoji: newEmoji, context: [] });
    }
    setNewProjectId(null);
    setMode('open');
  }, [addProject, drafts, newProjectId, projects, updateProject]);

  function cancelInlineEdit() {
    setNewProjectId(null);
    setMode('open');
  }

  function handleEditKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter') { event.preventDefault(); finishInlineEdit(); }
    if (event.key === 'Escape') { event.preventDefault(); cancelInlineEdit(); }
  }

  useEffect(() => {
    if (mode !== 'edit') return;
    gridRef.current?.querySelector<HTMLElement>(newProjectId ? '[data-new-project="true"] .project-inline-emoji' : '.project-inline-emoji')?.focus();
  }, [mode, newProjectId]);

  useEffect(() => {
    if (mode !== 'edit') return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && (event.target.closest('.project-inline-input') || event.target.closest('.project-inline-emoji') || event.target.closest('[data-project-edit-toggle]') || event.target.closest('[data-project-add-toggle]'))) return;
      finishInlineEdit();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mode, finishInlineEdit]);

  useEffect(() => {
    if (!controlsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && controlsRef.current?.contains(event.target)) return;
      setControlsOpen(false);
      if (mode === 'delete' && !(event.target instanceof Element && event.target.closest('.project-tile'))) setMode('open');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [controlsOpen, mode]);

  function chooseProject(project: Project) {
    if (mode === 'delete') {
      if (project.id !== 'gym' && window.confirm(`Delete ${project.title} and all its notes?`)) removeProject(project.id);
      setMode('open');
      return;
    }
    openProject(project.id);
  }

  return <main className="home-layout">
    <div className="home-left">
      <section className="home-projects" aria-label="Projects">
        <div className="home-projects-label">Projects</div>
        <div className="home-project-controls" ref={controlsRef}><button className="project-more" aria-label={controlsOpen ? 'Hide project controls' : 'Show project controls'} aria-expanded={controlsOpen} onClick={() => { setControlsOpen(!controlsOpen); setMode('open'); }}><MoreHorizontal size={20} /></button>
          <div className={`project-control-list ${controlsOpen ? 'open' : ''}`} inert={!controlsOpen}><button data-project-add-toggle aria-label="Add project" title="Add project" onClick={beginNewProject}><Plus size={17} /></button><button data-project-edit-toggle className={mode === 'edit' ? 'active' : ''} aria-label="Edit project" aria-pressed={mode === 'edit'} title="Edit project names and symbols" onClick={() => mode === 'edit' ? finishInlineEdit() : beginInlineEdit()}><Pencil size={17} /></button><button className={mode === 'delete' ? 'active' : ''} aria-label="Delete project" title="Choose a project to delete" onClick={() => setMode(mode === 'delete' ? 'open' : 'delete')}><Trash2 size={17} /></button></div>
        </div>
        <div ref={gridRef} className={`project-grid ${visibleProjects.length > 8 ? 'scrollable' : ''} ${mode !== 'open' ? 'choosing' : ''}`} style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(visibleProjects.length, 1), 4)}, minmax(0, 1fr))` }}>
          {visibleProjects.map((project) => mode === 'edit' ? <div className="project-tile project-tile-editing" data-new-project={project.id === newProjectId} key={project.id}><span ref={(element) => { emojiNodesRef.current[project.id] = element; }} className="project-symbol project-inline-emoji" data-special={project.id === 'gym' || undefined} role="textbox" aria-label={`${project.id === newProjectId ? 'New project' : project.title} symbol`} contentEditable="plaintext-only" suppressContentEditableWarning data-placeholder={project.id === newProjectId ? '✦' : undefined} onKeyDown={handleEditKeyDown}>{project.id === newProjectId ? '' : projectEmoji(project)}</span><input className="project-inline-input project-title-input" aria-label={`${project.id === newProjectId ? 'New project' : project.title} title`} placeholder={project.id === newProjectId ? 'Project name' : undefined} maxLength={80} value={drafts[project.id]?.title ?? project.title} onChange={(event) => setDrafts({ ...drafts, [project.id]: { ...drafts[project.id], title: event.target.value } })} onKeyDown={handleEditKeyDown} /></div> : <button className="project-tile" key={project.id} onClick={() => chooseProject(project)} aria-label={`${mode === 'delete' ? 'Delete' : 'Open'} ${project.title}`}><span className="project-symbol" data-special={project.id === 'gym' || undefined}>{projectEmoji(project)}</span><strong>{project.title}</strong></button>)}
        </div>
      </section>
      <section className="home-calendar" aria-label="Calendar"><CalendarView /></section>
    </div>
    <aside className="home-ai"><div className="home-ai-glow"><div className="home-ai-content"><AIChat global compact home /></div></div></aside>
  </main>;
}

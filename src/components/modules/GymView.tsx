import { useMemo, useState } from 'react';
import { Activity, Check, ChevronRight, Dumbbell, History, Library, Plus, Trophy } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';
import type { Workout, WorkoutExerciseLog } from '../../types';

type GymTab = 'overview' | 'workout' | 'history' | 'exercises';

export function GymView() {
  const exercises = useWorkspace((state) => state.exercises);
  const routines = useWorkspace((state) => state.routines);
  const workouts = useWorkspace((state) => state.workouts);
  const addWorkout = useWorkspace((state) => state.addWorkout);
  const addExercise = useWorkspace((state) => state.addExercise);
  const [tab, setTab] = useState<GymTab>('overview');
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [renderedAt] = useState(() => Date.now());
  const sorted = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const inclineHistory = sorted.slice().reverse().map((workout) => workout.exercises.find((item) => item.exerciseId === 'incline-db')?.sets[0]?.weight ?? 0).filter(Boolean);
  const totalSets = workouts.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets)).filter((set) => set.completed).length;
  const personalRecords = useMemo(() => exercises.map((exercise) => ({ exercise, weight: Math.max(0, ...workouts.flatMap((workout) => workout.exercises.filter((entry) => entry.exerciseId === exercise.id).flatMap((entry) => entry.sets.map((set) => set.weight)))) })).filter((record) => record.weight > 0).sort((a, b) => b.weight - a.weight), [exercises, workouts]);

  function startWorkout() {
    const routine = routines[0];
    setActiveWorkout({ id: crypto.randomUUID(), routineId: routine.id, title: routine.name, startedAt: new Date().toISOString(), exercises: routine.exercises.map((entry) => ({ exerciseId: entry.exerciseId, sets: Array.from({ length: entry.targetSets }, () => ({ id: crypto.randomUUID(), reps: 0, weight: 0, rir: 2, completed: false })) })) });
    setTab('workout');
  }

  function finishWorkout() {
    if (!activeWorkout) return;
    addWorkout({ ...activeWorkout, endedAt: new Date().toISOString() }); setActiveWorkout(null); setTab('overview');
  }

  function updateLog(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps' | 'rir', value: number) {
    if (!activeWorkout) return;
    const logs = activeWorkout.exercises.map((log, logIndex) => logIndex !== exerciseIndex ? log : { ...log, sets: log.sets.map((set, index) => index !== setIndex ? set : { ...set, [field]: value }) });
    setActiveWorkout({ ...activeWorkout, exercises: logs });
  }

  function toggleSet(exerciseIndex: number, setIndex: number) {
    if (!activeWorkout) return;
    const logs = activeWorkout.exercises.map((log, logIndex) => logIndex !== exerciseIndex ? log : { ...log, sets: log.sets.map((set, index) => index !== setIndex ? set : { ...set, completed: !set.completed }) });
    setActiveWorkout({ ...activeWorkout, exercises: logs });
  }

  function createExercise(event: React.FormEvent) {
    event.preventDefault(); if (!exerciseName.trim()) return;
    addExercise({ id: crypto.randomUUID(), name: exerciseName.trim(), category: 'Custom', equipment: 'Other' }); setExerciseName('');
  }

  return <div className="module-view gym-view">
    <div className="module-header"><div><p className="eyebrow">TRAINING</p><h1>Gym</h1><p>{workouts.length} sessions · {totalSets} completed sets</p></div>
      <button className="primary-button" onClick={startWorkout}><Dumbbell size={15} /> Start workout</button>
    </div>
    <nav className="module-tabs">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><Activity size={15} /> Overview</button>
      <button className={tab === 'workout' ? 'active' : ''} onClick={() => setTab('workout')}><Dumbbell size={15} /> Workout</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={15} /> History</button>
      <button className={tab === 'exercises' ? 'active' : ''} onClick={() => setTab('exercises')}><Library size={15} /> Exercises</button>
    </nav>

    {tab === 'overview' && <div className="gym-dashboard">
      <section className="metric-card"><span>Sessions this month</span><strong>{workouts.filter((workout) => renderedAt - new Date(workout.startedAt).getTime() < 31 * 86400000).length}</strong><small>Consistency builds progress</small></section>
      <section className="metric-card"><span>Latest workout</span><strong>{sorted[0]?.title ?? '—'}</strong><small>{sorted[0] ? new Date(sorted[0].startedAt).toLocaleDateString() : 'No sessions yet'}</small></section>
      <section className="metric-card accent"><span>Top incline press</span><strong>{Math.max(0, ...inclineHistory)} kg</strong><small>Best working set</small></section>
      <section className="progress-card"><div className="panel-heading"><Activity size={17} /><div><strong>Incline dumbbell press</strong><small>Top-set weight · last 8 sessions</small></div></div><ProgressChart values={inclineHistory} /></section>
      <section className="records-card"><div className="panel-heading"><Trophy size={17} /><div><strong>Personal records</strong><small>Your strongest logged sets</small></div></div>{personalRecords.slice(0, 4).map((record) => <div className="record-row" key={record.exercise.id}><span>{record.exercise.name}</span><strong>{record.weight} kg</strong></div>)}</section>
    </div>}

    {tab === 'workout' && (activeWorkout ? <div className="live-workout"><div className="live-workout-heading"><div><span className="live-dot" />Live workout<h2>{activeWorkout.title}</h2></div><button className="primary-button" onClick={finishWorkout}>Finish workout</button></div>
      {activeWorkout.exercises.map((log, exerciseIndex) => <ExerciseLogger key={log.exerciseId} log={log} exerciseName={exercises.find((item) => item.id === log.exerciseId)?.name ?? 'Exercise'} onUpdate={(setIndex, field, value) => updateLog(exerciseIndex, setIndex, field, value)} onToggle={(setIndex) => toggleSet(exerciseIndex, setIndex)} />)}
    </div> : <div className="empty-state"><Dumbbell size={25} /><h2>No active workout</h2><p>Start your routine and log each set without leaving this screen.</p><button className="primary-button" onClick={startWorkout}>Start Upper A</button></div>)}

    {tab === 'history' && <div className="history-list">{sorted.map((workout) => <article key={workout.id}><div className="history-date"><strong>{new Date(workout.startedAt).getDate()}</strong><span>{new Date(workout.startedAt).toLocaleDateString('en', { month: 'short' })}</span></div><div><strong>{workout.title}</strong><small>{workout.exercises.length} exercises · {workout.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0)} sets</small></div><ChevronRight size={17} /></article>)}</div>}

    {tab === 'exercises' && <div className="exercise-library"><form className="quick-add" onSubmit={createExercise}><Plus size={17} /><input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Create a custom exercise…" /></form><div className="exercise-grid">{exercises.map((exercise) => <article key={exercise.id}><div className="exercise-icon"><Dumbbell size={17} /></div><div><strong>{exercise.name}</strong><small>{exercise.category} · {exercise.equipment}</small></div></article>)}</div></div>}
  </div>;
}

function ExerciseLogger({ log, exerciseName, onUpdate, onToggle }: { log: WorkoutExerciseLog; exerciseName: string; onUpdate: (index: number, field: 'weight' | 'reps' | 'rir', value: number) => void; onToggle: (index: number) => void }) {
  return <section className="exercise-logger"><div className="exercise-logger-title"><Dumbbell size={16} /><strong>{exerciseName}</strong></div><div className="set-table"><div className="set-row header"><span>Set</span><span>kg</span><span>Reps</span><span>RIR</span><span /></div>{log.sets.map((set, index) => <div className={`set-row ${set.completed ? 'completed' : ''}`} key={set.id}><span>{index + 1}</span><input type="number" inputMode="decimal" value={set.weight || ''} onChange={(event) => onUpdate(index, 'weight', Number(event.target.value))} /><input type="number" inputMode="numeric" value={set.reps || ''} onChange={(event) => onUpdate(index, 'reps', Number(event.target.value))} /><input type="number" inputMode="numeric" value={set.rir ?? ''} onChange={(event) => onUpdate(index, 'rir', Number(event.target.value))} /><button onClick={() => onToggle(index)}>{set.completed && <Check size={14} />}</button></div>)}</div></section>;
}

function ProgressChart({ values }: { values: number[] }) {
  const width = 520, height = 150, padding = 18;
  if (values.length < 2) return <div className="chart-empty">Log two workouts to see a trend.</div>;
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const points = values.map((value, index) => `${padding + index * ((width - padding * 2) / (values.length - 1))},${height - padding - ((value - min) / (max - min)) * (height - padding * 2)}`).join(' ');
  return <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Incline press progress chart"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs><polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#chart-fill)" /><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{points.split(' ').map((point, index) => { const [cx, cy] = point.split(','); return <circle key={index} cx={cx} cy={cy} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />; })}</svg>;
}

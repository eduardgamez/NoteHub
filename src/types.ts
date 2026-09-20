export type BlockType = 'text' | 'code' | 'image' | 'checklist';

export interface Point { x: number; y: number; pressure?: number }

export interface InkStroke {
  id: string;
  color: string;
  width: number;
  points: Point[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  language?: string;
  caption?: string;
}

export interface Note {
  id: string;
  title: string;
  emoji: string;
  projectId: string;
  updatedAt: number;
  blocks: CanvasBlock[];
  strokes: InkStroke[];
}

export interface FolderContext {
  id: string;
  label: string;
  value: string;
}

export interface Project {
  id: string;
  title: string;
  emoji: string;
  context: FolderContext[];
}

export interface WorkspaceStateData {
  projects: Project[];
  notes: Record<string, Note>;
  activeNoteId: string;
}

export type ToolMode = 'select' | 'pan' | 'ink';

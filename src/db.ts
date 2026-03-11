import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface VideoAsset {
  id: string;
  projectId: string;
  name: string;
  handle?: FileSystemFileHandle;
  data?: ArrayBuffer; // Keep for backward compatibility or small files
  size: number;
  type: string;
  offset: number; // in seconds, relative to reference
  isReference: boolean;
  createdAt: number;
}

export interface Note {
  id: string;
  projectId: string;
  timestamp: number; // in seconds
  text: string;
  createdAt: number;
}

interface VideoNoteDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  videos: {
    key: string;
    value: VideoAsset;
    indexes: { 'by-project': string };
  };
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-project': string };
  };
}

let dbPromise: Promise<IDBPDatabase<VideoNoteDB>>;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VideoNoteDB>('video-note-db', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
        videoStore.createIndex('by-project', 'projectId');
        const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
        noteStore.createIndex('by-project', 'projectId');
      },
    });
  }
  return dbPromise;
}

export const db = {
  async saveProject(project: Project) {
    const d = await getDB();
    await d.put('projects', project);
  },
  async getProjects() {
    const d = await getDB();
    return d.getAll('projects');
  },
  async getProject(id: string) {
    const d = await getDB();
    return d.get('projects', id);
  },
  async deleteProject(id: string) {
    const d = await getDB();
    await d.delete('projects', id);
    // Also delete associated videos and notes
    const videos = await d.getAllFromIndex('videos', 'by-project', id);
    for (const v of videos) await d.delete('videos', v.id);
    const notes = await d.getAllFromIndex('notes', 'by-project', id);
    for (const n of notes) await d.delete('notes', n.id);
  },
  async saveVideo(video: VideoAsset) {
    const d = await getDB();
    await d.put('videos', video);
  },
  async getVideos(projectId: string) {
    const d = await getDB();
    return d.getAllFromIndex('videos', 'by-project', projectId);
  },
  async deleteVideo(id: string) {
    const d = await getDB();
    await d.delete('videos', id);
  },
  async saveNote(note: Note) {
    const d = await getDB();
    await d.put('notes', note);
  },
  async getNotes(projectId: string) {
    const d = await getDB();
    return d.getAllFromIndex('notes', 'by-project', projectId);
  },
  async deleteNote(id: string) {
    const d = await getDB();
    await d.delete('notes', id);
  }
};

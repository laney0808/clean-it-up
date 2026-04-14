import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { putOmniVideoFile } from './omniDb';

export type VideoRole = 'reference' | 'comparison';

export interface Project {
  id: string;
  title: string;
  omniProjectId: string;
  videoIds: string[];
  createdAt: number;
}

export interface ProjectVideo {
  id: string;
  projectId: string;
  displayName: string;
  omniFileKey: string;
  role: VideoRole;
  startAt: number; // seconds
  createdAt: number;
}

export interface Note {
  id: string;
  projectId: string;
  timestamp: number; // seconds
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
    value: ProjectVideo;
    indexes: { 'by-project': string };
  };
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-project': string };
  };
}

let dbPromise: Promise<IDBPDatabase<VideoNoteDB>>;

const DATABASE_NAME = 'video-note-db';
const DATABASE_VERSION = 2;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VideoNoteDB>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          database.createObjectStore('projects', { keyPath: 'id' });
          const videoStore = database.createObjectStore('videos', { keyPath: 'id' });
          videoStore.createIndex('by-project', 'projectId');
          const noteStore = database.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-project', 'projectId');
          return;
        }

        if (oldVersion < 2) {
          if (!database.objectStoreNames.contains('projects')) {
            database.createObjectStore('projects', { keyPath: 'id' });
          }

          if (!database.objectStoreNames.contains('videos')) {
            const videoStore = database.createObjectStore('videos', { keyPath: 'id' });
            videoStore.createIndex('by-project', 'projectId');
          } else {
            const videoStore = transaction.objectStore('videos');
            if (!videoStore.indexNames.contains('by-project')) {
              videoStore.createIndex('by-project', 'projectId');
            }
          }

          if (!database.objectStoreNames.contains('notes')) {
            const noteStore = database.createObjectStore('notes', { keyPath: 'id' });
            noteStore.createIndex('by-project', 'projectId');
          } else {
            const noteStore = transaction.objectStore('notes');
            if (!noteStore.indexNames.contains('by-project')) {
              noteStore.createIndex('by-project', 'projectId');
            }
          }
        }
      },
    });
  }

  return dbPromise;
}

const normalizeProject = (project: any): Project => ({
  id: project.id,
  title: project.title ?? project.name ?? 'Untitled Project',
  omniProjectId: project.omniProjectId ?? `legacy-${project.id}`,
  videoIds: Array.isArray(project.videoIds) ? project.videoIds : [],
  createdAt: project.createdAt ?? Date.now(),
});

const normalizeProjectVideo = (video: any): ProjectVideo => ({
  id: video.id,
  projectId: video.projectId,
  displayName: video.displayName ?? video.name ?? 'Untitled Video',
  omniFileKey: video.omniFileKey ?? '',
  role: video.role ?? (video.isReference ? 'reference' : 'comparison'),
  startAt: video.startAt ?? video.offset ?? 0,
  createdAt: video.createdAt ?? Date.now(),
});

const ensureProjectVideoIds = async (
  d: IDBPDatabase<VideoNoteDB>,
  project: Project,
) => {
  if (project.videoIds.length > 0) {
    return project;
  }

  const videos = (await d.getAllFromIndex('videos', 'by-project', project.id)).map(normalizeProjectVideo);
  if (videos.length === 0) {
    return project;
  }

  const updatedProject = {
    ...project,
    videoIds: videos.map((video) => video.id),
  };

  await d.put('projects', updatedProject);
  return updatedProject;
};

const migrateLegacyVideoIfNeeded = async (
  d: IDBPDatabase<VideoNoteDB>,
  project: Project,
  rawVideo: any,
) => {
  const normalizedVideo = normalizeProjectVideo(rawVideo);
  if (normalizedVideo.omniFileKey || !rawVideo?.data) {
    return normalizedVideo;
  }

  const omniFileKey = `${project.omniProjectId}:${normalizedVideo.id}`;
  const file = new File([rawVideo.data], normalizedVideo.displayName, {
    type: rawVideo.type || 'video/mp4',
    lastModified: normalizedVideo.createdAt,
  });

  await putOmniVideoFile(omniFileKey, file);

  const migratedVideo: ProjectVideo = {
    ...normalizedVideo,
    omniFileKey,
  };

  await d.put('videos', migratedVideo);
  return migratedVideo;
};

const syncProjectVideoIds = async (projectId: string) => {
  const d = await getDB();
  const projectRecord = await d.get('projects', projectId);
  if (!projectRecord) return;

  const project = normalizeProject(projectRecord);
  const videos = (await d.getAllFromIndex('videos', 'by-project', projectId)).map(normalizeProjectVideo);
  const nextVideoIds = videos.map((video) => video.id);

  if (
    project.videoIds.length === nextVideoIds.length &&
    project.videoIds.every((videoId, index) => videoId === nextVideoIds[index])
  ) {
    return;
  }

  await d.put('projects', {
    ...project,
    videoIds: nextVideoIds,
  });
};

export const db = {
  async saveProject(project: Project) {
    const d = await getDB();
    await d.put('projects', project);
  },

  async getProjects() {
    const d = await getDB();
    const projects = await d.getAll('projects');

    return Promise.all(
      projects.map(async (projectRecord) => {
        const normalizedProject = normalizeProject(projectRecord);
        return ensureProjectVideoIds(d, normalizedProject);
      }),
    );
  },

  async getProject(id: string) {
    const d = await getDB();
    const project = await d.get('projects', id);
    if (!project) return undefined;

    return ensureProjectVideoIds(d, normalizeProject(project));
  },

  async deleteProject(id: string) {
    const d = await getDB();
    await d.delete('projects', id);

    const videos = await d.getAllFromIndex('videos', 'by-project', id);
    for (const video of videos) {
      await d.delete('videos', video.id);
    }

    const notes = await d.getAllFromIndex('notes', 'by-project', id);
    for (const note of notes) {
      await d.delete('notes', note.id);
    }
  },

  async saveProjectVideo(video: ProjectVideo) {
    const d = await getDB();
    await d.put('videos', video);
    await syncProjectVideoIds(video.projectId);
  },

  async getProjectVideos(projectId: string) {
    const d = await getDB();
    const project = await d.get('projects', projectId);
    const normalizedProject = project
      ? await ensureProjectVideoIds(d, normalizeProject(project))
      : {
          id: projectId,
          title: 'Untitled Project',
          omniProjectId: `legacy-${projectId}`,
          videoIds: [],
          createdAt: Date.now(),
        };

    const videos = await d.getAllFromIndex('videos', 'by-project', projectId);
    const migratedVideos = await Promise.all(
      videos.map((videoRecord) => migrateLegacyVideoIfNeeded(d, normalizedProject, videoRecord)),
    );

    return migratedVideos;
  },

  async deleteProjectVideo(id: string) {
    const d = await getDB();
    const video = await d.get('videos', id);
    await d.delete('videos', id);
    if (video?.projectId) {
      await syncProjectVideoIds(video.projectId);
    }
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
  },
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Eye, Plus, RefreshCw, StickyNote, Video } from 'lucide-react';
import { setupContext } from 'omniclip';
import { omnislate } from 'omniclip/x/context/context.js';
import { db, Note, Project, ProjectVideo } from './db';
import { getOmniVideoFile, putOmniVideoFile } from './omniDb';
import { cn, formatTimestamp } from './utils';

const OMNICLIP_CANVAS = { width: 1920, height: 1080 };

type DrawerTab = 'videos' | 'notes';

const sortVideos = (videos: ProjectVideo[]) =>
  [...videos].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'reference' ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

const fitIntoRect = (
  sourceWidth: number,
  sourceHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
) => {
  const scale = Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    width: sourceWidth,
    height: sourceHeight,
    scaleX: scale,
    scaleY: scale,
    position_on_canvas: {
      x: bounds.x + (bounds.width - width) / 2,
      y: bounds.y + (bounds.height - height) / 2,
    },
    rotation: 0,
  };
};

const buildGridRects = (items: Array<{ width: number; height: number }>) => {
  if (items.length === 0) return [];

  const padding = 36;
  const gap = 24;
  const columns = Math.min(2, Math.ceil(Math.sqrt(items.length)));
  const rows = Math.ceil(items.length / columns);
  const cellWidth = (OMNICLIP_CANVAS.width - padding * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (OMNICLIP_CANVAS.height - padding * 2 - gap * (rows - 1)) / rows;

  return items.map((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;

    return fitIntoRect(item.width, item.height, {
      x: padding + column * (cellWidth + gap),
      y: padding + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
    });
  });
};

const configureOmniClipLayout = (context: any) => {
  context.layout.reset_to_default();

  const [primaryPane] = context.layout.seeker.panes;
  if (!primaryPane) return;

  context.layout.actions.split_pane(primaryPane.id, false);
  const secondaryPane = context.layout.seeker.panes.find((pane: any) => pane.id !== primaryPane.id);

  if (!secondaryPane) return;

  const [, playerLeafIndex] = context.layout.actions.add_leaf(secondaryPane.id, 'MediaPlayerPanel');
  context.layout.actions.add_leaf(secondaryPane.id, 'MediaPanel');
  context.layout.actions.add_leaf(secondaryPane.id, 'ExportPanel');
  context.layout.actions.add_leaf(secondaryPane.id, 'ProjectSettingsPanel');
  context.layout.actions.set_pane_active_leaf(secondaryPane.id, playerLeafIndex);
  context.layout.actions.resize(primaryPane.id, 40);
  context.layout.actions.resize(secondaryPane.id, 60);
};

export function OmniClipProjectView({
  project,
  onBack,
}: {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (project: Project) => void;
}) {
  const [videos, setVideos] = useState<ProjectVideo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('videos');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const editorHostRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.timestamp - b.timestamp),
    [notes],
  );

  useEffect(() => {
    let cancelled = false;

    const loadProjectData = async () => {
      setIsLoading(true);

      try {
        const [loadedVideos, loadedNotes] = await Promise.all([
          db.getProjectVideos(project.id),
          db.getNotes(project.id),
        ]);

        if (cancelled) return;

        setVideos(sortVideos(loadedVideos));
        setNotes(loadedNotes);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadProjectData();

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;

    const mountOmniClip = async () => {
      if (!editorHostRef.current) return;

      setIsSyncing(true);

      try {
        setupContext();
        const context = omnislate.context;

        configureOmniClipLayout(context);
        context.clear_project();
        await context.controllers.media.get_imported_files();

        const editor = document.createElement('construct-editor');
        editor.className = 'block h-full w-full';
        editorHostRef.current.innerHTML = '';
        editorHostRef.current.appendChild(editor);

        const projectFiles = (
          await Promise.all(
            videos.map(async (video) => {
              const file = await getOmniVideoFile(video.omniFileKey);
              return file ? { video, file } : null;
            }),
          )
        ).filter(Boolean) as Array<{ video: ProjectVideo; file: File }>;

        if (cancelled || projectFiles.length === 0) return;

        const sources = await context.controllers.media.create_videos_from_video_files(
          projectFiles.map(({ video, file }) => ({
            hash: video.omniFileKey,
            file,
            kind: 'video',
          })) as any,
        );

        if (cancelled) return;

        const frameDuration = 1000 / context.state.timebase;
        const rects = buildGridRects(
          sources.map((source: any) => ({
            width: source.element.videoWidth || OMNICLIP_CANVAS.width,
            height: source.element.videoHeight || OMNICLIP_CANVAS.height,
          })),
        );

        sources.forEach((source: any, index: number) => {
          const projectFile = projectFiles[index];
          if (!projectFile) return;

          const rawDuration = source.element.duration * 1000;
          const normalizedDuration = Math.max(
            frameDuration,
            Math.floor(rawDuration / frameDuration) * frameDuration - 40,
          );

          context.controllers.compositor.managers.videoManager.add_video_effect(
            {
              frames: source.frames,
              id: crypto.randomUUID(),
              name: projectFile.video.displayName,
              kind: 'video',
              file_hash: projectFile.video.omniFileKey,
              raw_duration: rawDuration,
              duration: normalizedDuration,
              start_at_position: Math.round(projectFile.video.role === 'reference' ? 0 : projectFile.video.startAt * 1000),
              start: 0,
              end: normalizedDuration,
              track: index,
              thumbnail: source.thumbnail,
              rect: rects[index],
            },
            projectFile.file,
          );
        });

        context.actions.set_timecode(0);
        context.controllers.compositor.compose_effects(context.state.effects, 0);
        await context.controllers.compositor.set_current_time_of_audio_or_video_and_redraw(true, 0);
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };

    void mountOmniClip();

    return () => {
      cancelled = true;
      if (editorHostRef.current) {
        editorHostRef.current.innerHTML = '';
      }
    };
  }, [videos]);

  const reloadProjectVideos = async () => {
    const loadedVideos = await db.getProjectVideos(project.id);
    setVideos(sortVideos(loadedVideos));
  };

  const handleAddVideo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSyncing(true);

    try {
      const videoId = crypto.randomUUID();
      const omniFileKey = `${project.omniProjectId}:${videoId}`;

      await putOmniVideoFile(omniFileKey, file);

      const hasReference = videos.some((video) => video.role === 'reference');
      const newVideo: ProjectVideo = {
        id: videoId,
        projectId: project.id,
        displayName: file.name,
        omniFileKey,
        role: hasReference ? 'comparison' : 'reference',
        startAt: 0,
        createdAt: Date.now(),
      };

      await db.saveProjectVideo(newVideo);
      await reloadProjectVideos();
    } finally {
      setIsSyncing(false);
      event.target.value = '';
    }
  };

  return (
    <div className="h-screen bg-[#0f1116] flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 border-b border-white/10 px-5 flex items-center justify-between bg-[#141821]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="font-semibold text-white truncate">{project.title}</p>
            <p className="text-xs text-zinc-400 mt-0.5">OmniClip editor view</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reloadProjectVideos}
            className="px-3 py-2 rounded-xl border border-white/10 text-zinc-300 hover:bg-white/5 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw size={16} />
            Reload
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 transition-colors flex items-center gap-2 text-sm font-semibold"
          >
            <Plus size={16} />
            Add Video
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleAddVideo}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          <div ref={editorHostRef} className="absolute inset-0" />

          {!isLoading && videos.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center text-zinc-300">
                <Video size={36} className="mx-auto mb-3 opacity-50" />
                <p className="font-medium">No videos available for this project.</p>
                <p className="text-sm text-zinc-500 mt-1">
                  Add a video to store it directly in OmniClip and start testing the editor.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="w-[340px] shrink-0 border-l border-white/10 bg-[#141821] flex flex-col">
          <div className="p-4 border-b border-white/10">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-1 flex gap-1">
              <button
                type="button"
                onClick={() => setDrawerTab('videos')}
                className={cn(
                  'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  drawerTab === 'videos'
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-300 hover:bg-white/5',
                )}
              >
                Videos
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('notes')}
                className={cn(
                  'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  drawerTab === 'notes'
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-300 hover:bg-white/5',
                )}
              >
                Notes
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {drawerTab === 'videos' ? (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{video.displayName}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {video.role === 'reference' ? 'Reference clip' : 'Comparison clip'}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-white/10 p-2 text-zinc-300 opacity-60 cursor-not-allowed"
                        title="Visibility control coming next."
                        disabled
                      >
                        <Eye size={16} />
                      </button>
                    </div>

                    <label className="block mt-3">
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Offset / Start At
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={video.role === 'reference' ? 0 : video.startAt}
                        readOnly
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300 outline-none"
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedNotes.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-zinc-400">
                    No notes yet for this project.
                  </div>
                ) : (
                  sortedNotes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-white/10 bg-black/10 p-4"
                    >
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
                        <StickyNote size={12} />
                        <span>{formatTimestamp(note.timestamp)}</span>
                      </div>
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {(isLoading || isSyncing) && (
        <div className="absolute inset-0 z-20 bg-[#0f1116]/85 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center text-white">
            <RefreshCw size={28} className="mx-auto mb-3 animate-spin" />
            <p className="font-medium">{isLoading ? 'Loading project…' : 'Syncing OmniClip…'}</p>
            <p className="text-sm text-zinc-400 mt-1">
              {isLoading
                ? 'Reading project metadata, notes, and media references.'
                : 'Rebuilding the OmniClip editor with the current project videos.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

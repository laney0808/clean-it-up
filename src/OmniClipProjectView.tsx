import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus, RefreshCw, Settings2, Share, StickyNote, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { db, Note, Project, VideoAsset } from './db';
import { exportStandaloneHtml } from './exporter';
import { cn, formatTimestamp } from './utils';
import { OmniClipEmbed, OmniClipHandle } from './omni/OmniClipEmbed';
import { ensureOmniContext, sha256Hex } from './omni/omniclip';

export function OmniClipProjectView(props: {
  project: Project;
  onBack: () => void;
  onConfirmDelete: (config: { title: string; message: string; onConfirm: () => void }) => void;
  onProjectUpdate: (project: Project) => void;
}) {
  const { project, onBack, onConfirmDelete, onProjectUpdate } = props;

  const playerRef = useRef<OmniClipHandle>(null);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processing...');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectName, setProjectName] = useState(project.name);

  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  const referenceVideo = useMemo(() => videos.find((v) => v.isReference), [videos]);

  useEffect(() => setProjectName(project.name), [project.name]);

  useEffect(() => {
    void loadProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const migrateVideoToOmniIfNeeded = async (video: VideoAsset) => {
    if (video.omniFileHash) return video;
    if (!video.data) return video;

    const type = video.type ?? 'video/mp4';
    const file = new File([video.data], video.name, { type });
    const hash = await sha256Hex(file);

    const ctx = ensureOmniContext(project.id);
    await ctx.controllers.media.import_file(file);

    const updated: VideoAsset = { ...video, omniFileHash: hash, data: undefined, type, size: file.size };
    await db.saveVideo(updated);
    return updated;
  };

  const loadProjectData = async () => {
    setIsProcessing(true);
    setProcessingMessage('Loading project...');
    try {
      const [vids, nts] = await Promise.all([db.getVideos(project.id), db.getNotes(project.id)]);
      const migrated = await Promise.all(vids.map(migrateVideoToOmniIfNeeded));
      setVideos(migrated);
      setNotes(nts.sort((a, b) => a.timestamp - b.timestamp));

      if (selectedVideoIds.length === 0) {
        const ref = migrated.find((v) => v.isReference);
        if (ref) setSelectedVideoIds([ref.id]);
      }
    } finally {
      setIsProcessing(false);
      setProcessingMessage('Processing...');
    }
  };

  const updateProjectName = async () => {
    if (!projectName.trim() || projectName === project.name) {
      setProjectName(project.name);
      setIsEditingProjectName(false);
      return;
    }
    const updatedProject = { ...project, name: projectName };
    await db.saveProject(updatedProject);
    onProjectUpdate(updatedProject);
    setIsEditingProjectName(false);
  };

  const handleAddVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProcessingMessage('Importing video into OmniClip...');
    try {
      const hash = await sha256Hex(file);
      const ctx = ensureOmniContext(project.id);
      await ctx.controllers.media.import_file(file);

      const newVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: file.name,
        omniFileHash: hash,
        size: file.size,
        type: file.type,
        offset: 0,
        isReference: false,
        createdAt: Date.now(),
      };

      await db.saveVideo(newVideo);
      setVideos((prev) => [...prev, newVideo]);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('Processing...');
      e.target.value = '';
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const newNote: Note = {
      id: crypto.randomUUID(),
      projectId: project.id,
      timestamp: currentTime,
      text: noteText,
      createdAt: Date.now(),
    };
    await db.saveNote(newNote);
    setNotes((prev) => [...prev, newNote].sort((a, b) => a.timestamp - b.timestamp));
    setNoteText('');
    setIsAddingNote(false);
  };

  const toggleSelected = (videoId: string) => {
    setSelectedVideoIds((prev) => (prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]));
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <header className="h-16 border-b border-zinc-100 px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors">
            <ChevronLeft size={20} />
          </button>
          {isEditingProjectName ? (
            <input
              autoFocus
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={updateProjectName}
              onKeyDown={(e) => e.key === 'Enter' && updateProjectName()}
              className="font-bold text-zinc-900 bg-zinc-50 border border-zinc-200 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-zinc-900/5"
            />
          ) : (
            <h1
              onClick={() => setIsEditingProjectName(true)}
              className="font-bold text-zinc-900 truncate max-w-[240px] md:max-w-md cursor-pointer hover:bg-zinc-50 px-2 py-1 rounded transition-colors"
              title={projectName}
            >
              {projectName}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setProcessingMessage('Starting export...');
              setIsProcessing(true);
              try {
                await exportStandaloneHtml(project, videos, notes, null, (msg) => setProcessingMessage(msg));
              } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed. If you created this project via OmniClip, try again after the videos finish importing.');
              } finally {
                setIsProcessing(false);
                setProcessingMessage('Processing...');
              }
            }}
            disabled={isProcessing}
            className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-500 transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Export Standalone HTML"
          >
            {isProcessing ? <RefreshCw size={20} className="animate-spin" /> : <Share size={20} />}
            <span className="text-sm font-semibold hidden md:inline">{isProcessing ? 'Exporting...' : 'Export'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen((v) => !v)}
            className={cn(
              'p-2 rounded-xl transition-colors',
              isSettingsOpen ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100 text-zinc-500',
            )}
            title="Videos"
          >
            <Settings2 size={20} />
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirmDelete({
                title: 'Delete Project',
                message: 'This will remove the project and its notes. (Videos remain in OmniClip storage.)',
                onConfirm: async () => {
                  await db.deleteProject(project.id);
                  onBack();
                },
              })
            }
            className="p-2 rounded-xl hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors"
            title="Delete project"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 min-h-0">
        <div className="p-4 md:p-6 bg-zinc-50 min-h-0 overflow-auto">
          <OmniClipEmbed
            ref={playerRef}
            projectId={project.id}
            videos={videos}
            selectedVideoIds={selectedVideoIds}
            onTimeSecondsChange={(s) => setCurrentTime(s)}
            onDurationSecondsChange={(s) => setDuration(s)}
            onPlayingChange={(p) => setIsPlaying(p)}
          />
        </div>

        <div className="border-l border-zinc-100 bg-white min-h-0 flex flex-col">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Notes</div>
              <div className="text-sm font-mono font-bold text-zinc-900 tabular-nums">
                {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingNote(true)}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-2"
            >
              <StickyNote size={16} />
              <span className="text-sm font-semibold">Add</span>
            </button>
          </div>

          <div className="flex-1 overflow-auto p-2">
            {notes.length === 0 ? (
              <div className="p-6 text-sm text-zinc-500">No notes yet.</div>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => playerRef.current?.seekSeconds(note.timestamp)}
                    className="w-full text-left p-3 rounded-xl hover:bg-zinc-50 transition-colors border border-transparent hover:border-zinc-100"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">{formatTimestamp(note.timestamp)}</span>
                      <span className="text-[10px] text-zinc-400">{new Date(note.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm text-zinc-800 line-clamp-3 mt-1 whitespace-pre-wrap">{note.text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed inset-x-0 bottom-0 z-50 p-4"
          >
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="font-bold text-zinc-900">Videos on timeline</div>
                <label className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer flex items-center gap-2">
                  <Plus size={16} />
                  <span>Add video</span>
                  <input type="file" accept="video/*" className="hidden" onChange={handleAddVideo} />
                </label>
              </div>
              <div className="max-h-[50vh] overflow-auto divide-y divide-zinc-100">
                {videos.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-500">No videos.</div>
                ) : (
                  videos.map((v) => (
                    <label key={v.id} className="flex items-center gap-3 p-4 hover:bg-zinc-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedVideoIds.includes(v.id)}
                        onChange={() => toggleSelected(v.id)}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-zinc-900 truncate">{v.name}</span>
                          {v.isReference ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                              Reference
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono truncate">{v.omniFileHash ?? 'Not imported yet'}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-zinc-100 flex items-center justify-between">
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors text-sm font-semibold text-zinc-800"
                  onClick={() => playerRef.current?.clearTimeline()}
                >
                  Clear timeline
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-colors text-sm font-semibold"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingNote && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
              onClick={() => setIsAddingNote(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-zinc-900">Add Note</h3>
                  <div className="text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100 font-mono font-bold text-sm tabular-nums">
                    {formatTimestamp(currentTime)}
                  </div>
                </div>
                <textarea
                  autoFocus
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="What did you observe at this moment?"
                  className="w-full h-40 bg-zinc-50 border border-zinc-100 rounded-2xl p-4 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all resize-none"
                />
                <div className="flex gap-3 mt-8">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNote(false);
                      setNoteText('');
                    }}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!noteText.trim()}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-zinc-200"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md"
          >
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-zinc-100 rounded-full" />
              <motion.div
                className="absolute inset-0 border-4 border-zinc-900 rounded-full border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            </div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-zinc-900 font-semibold text-lg">
              {processingMessage}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


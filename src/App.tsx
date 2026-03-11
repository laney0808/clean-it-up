/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Video, Trash2, ChevronLeft, Play, Pause, SkipBack, SkipForward, StickyNote, Clock, Settings2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, Project, VideoAsset, Note } from './db';
import { cn, formatTimestamp } from './utils';

// --- Components ---

const ProjectCard = ({ project, onClick, onDelete }: { project: Project; onClick: () => void; onDelete: (e: React.MouseEvent) => void; key?: React.Key }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    onClick={onClick}
    className="group relative bg-white border border-zinc-200 rounded-2xl p-6 cursor-pointer hover:border-zinc-400 transition-all shadow-sm hover:shadow-md"
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-zinc-100 rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-colors">
          <Video size={24} />
        </div>
        <div>
          <h3 className="font-semibold text-zinc-900 text-lg">{project.name}</h3>
          <p className="text-sm text-zinc-500">Created {new Date(project.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(e);
        }}
        className="relative z-30 p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
      >
        <Trash2 size={18} />
      </button>
    </div>
  </motion.div>
);

const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string;
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
        >
          <h3 className="text-xl font-bold text-zinc-900 mb-2">{title}</h3>
          <p className="text-zinc-500 mb-8">{message}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-6 py-3 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-100"
            >
              Delete
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const LoadingOverlay = ({ 
  isVisible, 
  message = "Processing video..." 
}: { 
  isVisible: boolean; 
  message?: string;
}) => (
  <AnimatePresence>
    {isVisible && (
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
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-zinc-900 font-semibold text-lg"
        >
          {message}
        </motion.p>
        <p className="text-zinc-400 text-sm mt-2">This may take a few moments for large files.</p>
      </motion.div>
    )}
  </AnimatePresence>
);

const VideoSyncPlayer = ({ 
  refVideo, 
  compVideo, 
  currentTime, 
  isPlaying, 
  onTimeUpdate,
  onDurationChange
}: { 
  refVideo: VideoAsset; 
  compVideo?: VideoAsset; 
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}) => {
  const refVideoRef = useRef<HTMLVideoElement>(null);
  const compVideoRef = useRef<HTMLVideoElement>(null);
  const [refUrl, setRefUrl] = useState<string | undefined>(undefined);
  const [compUrl, setCompUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const blob = new Blob([refVideo.data], { type: refVideo.type });
    const url = URL.createObjectURL(blob);
    setRefUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setRefUrl(undefined);
    };
  }, [refVideo.id]);

  useEffect(() => {
    if (compVideo) {
      const blob = new Blob([compVideo.data], { type: compVideo.type });
      const url = URL.createObjectURL(blob);
      setCompUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setCompUrl(undefined);
      };
    } else {
      setCompUrl(undefined);
    }
  }, [compVideo?.id]);

  // Sync playback state - run when isPlaying OR when URLs are ready
  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    if (isPlaying) {
      ref.play().catch(() => {});
      comp?.play().catch(() => {});
    } else {
      ref.pause();
      comp?.pause();
    }
  }, [isPlaying, refUrl, compUrl]);

  // Sync current time only on seek or initial load
  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    // Only sync if the difference is significant (seeking)
    if (Math.abs(ref.currentTime - currentTime) > 0.3) {
      ref.currentTime = currentTime;
    }

    if (comp && compVideo) {
      const compTime = currentTime + compVideo.offset;
      if (Math.abs(comp.currentTime - compTime) > 0.3) {
        comp.currentTime = Math.max(0, compTime);
      }
    }
  }, [currentTime, compVideo?.offset]);

  const handleRefTimeUpdate = () => {
    if (refVideoRef.current) {
      onTimeUpdate(refVideoRef.current.currentTime);
    }
  };

  return (
    <div className={cn("grid gap-4", compVideo ? "grid-cols-2" : "grid-cols-1")}>
      <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-200 shadow-inner">
        {refUrl && (
          <video
            ref={refVideoRef}
            src={refUrl}
            className="w-full h-full object-contain"
            onTimeUpdate={handleRefTimeUpdate}
            onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
            playsInline
            preload="auto"
          />
        )}
        <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
          Reference
        </div>
      </div>
      {compVideo && (
        <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-zinc-200 shadow-inner">
          {compUrl && (
            <video
              ref={compVideoRef}
              src={compUrl}
              className="w-full h-full object-contain"
              playsInline
              muted // Mute comparison video to avoid audio overlap
              preload="auto"
            />
          )}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
            Comparison
          </div>
          {currentTime + compVideo.offset < 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-medium">
              Waiting for offset...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const OffsetInput = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => {
  const [localValue, setLocalValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleCommit = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      if (parsed !== value) {
        onChange(parsed);
      }
    } else {
      setLocalValue(value.toString());
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={localValue}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '' || val === '-' || /^-?\d*\.?\d*$/.test(val)) {
          setLocalValue(val);
        }
      }}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleCommit();
          inputRef.current?.blur();
        }
      }}
      className="w-24 bg-white border border-zinc-200 rounded px-2 py-1 text-xs font-mono focus:ring-2 focus:ring-zinc-900/5 outline-none"
    />
  );
};

const ProjectViewer = ({ 
  project, 
  onBack,
  onConfirmDelete
}: { 
  project: Project; 
  onBack: () => void;
  onConfirmDelete: (config: { title: string; message: string; onConfirm: () => void }) => void;
}) => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [duration, setDuration] = useState(0);
  
  // Viewer state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedCompVideoId, setSelectedCompVideoId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  const loadProjectData = async () => {
    setIsProcessing(true);
    try {
      const [vids, nts] = await Promise.all([
        db.getVideos(project.id),
        db.getNotes(project.id)
      ]);
      setVideos(vids);
      setNotes(nts.sort((a, b) => a.timestamp - b.timestamp));
      
      // Auto-select first comparison video if none selected
      const comps = vids.filter(v => !v.isReference);
      if (comps.length > 0 && !selectedCompVideoId) {
        setSelectedCompVideoId(comps[0].id);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const newVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: file.name,
        data,
        type: file.type,
        offset: 0,
        isReference: false,
        createdAt: Date.now(),
      };

      await db.saveVideo(newVideo);
      await loadProjectData();
      setSelectedCompVideoId(newVideo.id);
    } finally {
      setIsProcessing(false);
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
    setNotes([...notes, newNote].sort((a, b) => a.timestamp - b.timestamp));
    setNoteText('');
    setIsAddingNote(false);
  };

  const updateVideoOffset = async (videoId: string, offset: number) => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    
    const updated = { ...video, offset };
    await db.saveVideo(updated);
    setVideos(videos.map(v => v.id === videoId ? updated : v));
  };

  const referenceVideo = useMemo(() => videos.find(v => v.isReference), [videos]);
  const comparisonVideo = useMemo(() => videos.find(v => v.id === selectedCompVideoId), [videos, selectedCompVideoId]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-100 px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-bold text-zinc-900 truncate max-w-[200px] md:max-w-md">{project.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={cn(
              "p-2 rounded-xl transition-colors",
              isSettingsOpen ? "bg-zinc-900 text-white" : "hover:bg-zinc-100 text-zinc-500"
            )}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-zinc-50">
          <div className="max-w-6xl mx-auto space-y-6">
            {referenceVideo && (
              <VideoSyncPlayer
                refVideo={referenceVideo}
                compVideo={comparisonVideo}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
              />
            )}

            {/* Controls */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentTime(Math.max(0, currentTime - 5))}
                    className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-600"
                  >
                    <SkipBack size={20} />
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-12 h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center hover:bg-zinc-800 transition-colors shadow-md"
                  >
                    {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
                  </button>
                  <button 
                    onClick={() => setCurrentTime(currentTime + 5)}
                    className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-600"
                  >
                    <SkipForward size={20} />
                  </button>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-2xl font-mono font-bold text-zinc-900 tabular-nums">
                    {formatTimestamp(currentTime)}
                  </span>
                  <span className="text-xs text-zinc-400 uppercase tracking-widest font-bold">Current Time</span>
                </div>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setIsAddingNote(true);
                  }}
                  className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-100"
                >
                  <StickyNote size={20} />
                  <span>Add Note</span>
                </button>
              </div>

              {/* Progress Bar */}
              {referenceVideo && (
                <div className="relative h-2 bg-zinc-100 rounded-full overflow-hidden cursor-pointer group">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.01"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div 
                    className="absolute top-0 left-0 h-full bg-zinc-900 transition-all duration-100"
                    style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
              )}
            </div>

            {/* Settings / Comparison Selection */}
            <AnimatePresence>
              {isSettingsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white border border-zinc-200 rounded-2xl overflow-hidden"
                >
                  <div className="p-6 space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-zinc-900">Comparison Videos</h3>
                        <label className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 cursor-pointer flex items-center gap-1">
                          <Plus size={16} />
                          <span>Add Video</span>
                          <input type="file" accept="video/*" className="hidden" onChange={handleAddVideo} />
                        </label>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {videos.filter(v => !v.isReference).map(v => (
                          <div 
                            key={v.id}
                            className={cn(
                              "p-4 rounded-xl border transition-all cursor-pointer",
                              selectedCompVideoId === v.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 hover:border-zinc-300"
                            )}
                            onClick={() => setSelectedCompVideoId(v.id)}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-medium text-sm truncate pr-4">{v.name}</span>
                              <button 
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  onConfirmDelete({
                                    title: 'Delete Video',
                                    message: 'Are you sure you want to delete this comparison video?',
                                    onConfirm: async () => {
                                      await db.deleteVideo(v.id);
                                      if (selectedCompVideoId === v.id) setSelectedCompVideoId(null);
                                      loadProjectData();
                                    }
                                  });
                                }}
                                className="text-zinc-400 hover:text-red-500"
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-zinc-500 font-bold uppercase">Offset</span>
                              <OffsetInput 
                                value={v.offset} 
                                onChange={(newOffset) => updateVideoOffset(v.id, newOffset)} 
                              />
                              <span className="text-[10px] text-zinc-400">sec</span>
                            </div>
                          </div>
                        ))}
                        {videos.filter(v => !v.isReference).length === 0 && (
                          <div className="col-span-2 py-8 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-xl">
                            No comparison videos added.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Sidebar: Notes */}
        <div className="w-full lg:w-96 border-l border-zinc-100 bg-white flex flex-col h-[400px] lg:h-auto">
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote size={20} className="text-zinc-400" />
              <h2 className="font-bold text-zinc-900">Notes</h2>
            </div>
            <span className="text-xs font-bold bg-zinc-100 px-2 py-1 rounded text-zinc-500">
              {notes.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <AnimatePresence mode="popLayout">
              {notes.map(note => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-xl p-4 transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentTime(note.timestamp);
                    setIsPlaying(false);
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <Clock size={14} />
                      <span className="text-xs font-mono font-bold">{formatTimestamp(note.timestamp)}</span>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        onConfirmDelete({
                          title: 'Delete Note',
                          message: 'Are you sure you want to delete this note?',
                          onConfirm: async () => {
                            await db.deleteNote(note.id);
                            setNotes(notes.filter(n => n.id !== note.id));
                          }
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                </motion.div>
              ))}
            </AnimatePresence>
            {notes.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-12">
                <StickyNote size={32} className="mb-3 opacity-20" />
                <p className="text-sm">No notes yet</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Note Modal */}
      <AnimatePresence>
        {isAddingNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
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
                  <div className="flex items-center gap-2 text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
                    <Clock size={16} />
                    <span className="text-sm font-mono font-bold">{formatTimestamp(currentTime)}</span>
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
                    onClick={() => setIsAddingNote(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
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

      <LoadingOverlay isVisible={isProcessing} />
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const all = await db.getProjects();
    setProjects(all.sort((a, b) => b.createdAt - a.createdAt));
    setIsLoading(false);
  };

  const handleCreateProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const projectId = crypto.randomUUID();
      const newProject: Project = {
        id: projectId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        createdAt: Date.now(),
      };

      const data = await file.arrayBuffer();
      const refVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId,
        name: file.name,
        data,
        type: file.type,
        offset: 0,
        isReference: true,
        createdAt: Date.now(),
      };

      await db.saveProject(newProject);
      await db.saveVideo(refVideo);
      
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project and all its data? This action cannot be undone.',
      onConfirm: async () => {
        await db.deleteProject(id);
        setProjects(prev => prev.filter(p => p.id !== id));
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-pulse text-zinc-400 font-medium">Loading VideoNote...</div>
      </div>
    );
  }

  if (currentProject) {
    return (
      <ProjectViewer 
        project={currentProject} 
        onBack={() => setCurrentProject(null)}
        onConfirmDelete={(config) => setConfirmConfig({ ...config, isOpen: true })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">VideoNote</h1>
            <p className="text-zinc-500 mt-2">Annotate and compare videos with precision.</p>
          </div>
          <label className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-2xl font-semibold cursor-pointer hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-200">
            <Plus size={20} />
            <span>New Project</span>
            <input type="file" accept="video/*" className="hidden" onChange={handleCreateProject} />
          </label>
        </header>

        {projects.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-20 text-center">
            <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-zinc-400">
              <Video size={32} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">No projects yet</h2>
            <p className="text-zinc-500 mt-2 max-w-sm mx-auto">
              Upload your first video to create a project and start annotating.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onClick={() => setCurrentProject(p)}
                  onDelete={(e) => handleDeleteProject(p.id, e)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
      />

      <LoadingOverlay isVisible={isProcessing} />
    </div>
  );
}

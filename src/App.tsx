/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Video, Trash2, ChevronLeft, Play, Pause, SkipBack, SkipForward, StickyNote, Clock, Settings2, X, AlertTriangle, RefreshCw, FileVideo, ShieldCheck, Share, Volume2, VolumeX, Pencil, Eye, EyeOff, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, Project, VideoAsset, Note } from './db';
import { cn, formatTimestamp } from './utils';
import { exportStandaloneHtml } from './exporter';
import { importFromHtml } from './importer';

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
  refBlob,
  compBlob,
  currentTime, 
  isPlaying, 
  isRefMuted,
  isCompMuted,
  isRefHidden,
  onToggleRefMute,
  onToggleCompMute,
  onTimeUpdate,
  onDurationChange
}: { 
  refVideo: VideoAsset; 
  compVideo?: VideoAsset; 
  refBlob?: Blob;
  compBlob?: Blob;
  currentTime: number;
  isPlaying: boolean;
  isRefMuted: boolean;
  isCompMuted: boolean;
  isRefHidden: boolean;
  onToggleRefMute: () => void;
  onToggleCompMute: () => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}) => {
  const refVideoRef = useRef<HTMLVideoElement>(null);
  const compVideoRef = useRef<HTMLVideoElement>(null);
  const [refUrl, setRefUrl] = useState<string | undefined>(undefined);
  const [compUrl, setCompUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!refBlob) return;
    const url = URL.createObjectURL(refBlob);
    setRefUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setRefUrl(undefined);
    };
  }, [refBlob, refVideo.id]);

  useEffect(() => {
    if (compBlob) {
      const url = URL.createObjectURL(compBlob);
      setCompUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setCompUrl(undefined);
      };
    } else {
      setCompUrl(undefined);
    }
  }, [compBlob, compVideo?.id]);

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
    <div className={cn("grid gap-0", (compVideo && !isRefHidden) ? "grid-cols-2" : "grid-cols-1")}>
      {!isRefHidden && (
        <div className="relative aspect-video bg-black overflow-hidden shadow-inner">
          {refUrl && (
            <video
              ref={refVideoRef}
              src={refUrl}
              className="w-full h-full object-contain"
              onTimeUpdate={handleRefTimeUpdate}
              onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
              playsInline
              muted={isRefMuted}
              preload="auto"
            />
          )}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
            Reference
          </div>
          <button
            onClick={onToggleRefMute}
            className={cn(
              "absolute top-4 right-4 p-2 rounded-lg backdrop-blur-sm transition-colors",
              isRefMuted ? "bg-red-500/80 text-white" : "bg-black/50 text-white hover:bg-black/70"
            )}
          >
            {isRefMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      )}
      
      {/* Hidden reference video for sync when hidden */}
      {isRefHidden && refUrl && (
        <video
          ref={refVideoRef}
          src={refUrl}
          className="hidden"
          onTimeUpdate={handleRefTimeUpdate}
          onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
          playsInline
          muted={isRefMuted}
          preload="auto"
        />
      )}

      {compVideo && (
        <div className="relative aspect-video bg-black overflow-hidden shadow-inner">
          {compUrl && (
            <video
              ref={compVideoRef}
              src={compUrl}
              className="w-full h-full object-contain"
              playsInline
              muted={isCompMuted}
              preload="auto"
            />
          )}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
            Comparison
          </div>
          <button
            onClick={onToggleCompMute}
            className={cn(
              "absolute top-4 right-4 p-2 rounded-lg backdrop-blur-sm transition-colors",
              isCompMuted ? "bg-red-500/80 text-white" : "bg-black/50 text-white hover:bg-black/70"
            )}
          >
            {isCompMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
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
  onConfirmDelete,
  onProjectUpdate
}: { 
  project: Project; 
  onBack: () => void;
  onConfirmDelete: (config: { title: string; message: string; onConfirm: () => void }) => void;
  onProjectUpdate: (project: Project) => void;
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
  const [processingMessage, setProcessingMessage] = useState('Processing video...');
  const [isRefMuted, setIsRefMuted] = useState(false);
  const [isCompMuted, setIsCompMuted] = useState(true);
  const [isRefHidden, setIsRefHidden] = useState(false);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [tempVideoName, setTempVideoName] = useState('');
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [showLandscapeHint, setShowLandscapeHint] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLandscapeHint(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    setProjectName(project.name);
  }, [project.name]);

  useEffect(() => {
    if (!isPlaying) setShowControls(true);
  }, [isPlaying]);

  // File System Access State
  const [resolvedBlobs, setResolvedBlobs] = useState<Record<string, Blob>>({});
  const [permissionStatus, setPermissionStatus] = useState<Record<string, 'granted' | 'denied' | 'prompt' | 'missing'>>({});

  useEffect(() => {
    loadProjectData();
  }, [project.id]);

  const resolveVideo = useCallback(async (video: VideoAsset) => {
    if (video.data) {
      const blob = new Blob([video.data], { type: video.type });
      setResolvedBlobs(prev => ({ ...prev, [video.id]: blob }));
    }
  }, []);

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

      // Resolve all videos
      for (const v of vids) {
        resolveVideo(v);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setProcessingMessage('Adding video...');
    setIsProcessing(true);
    try {
      const newVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: file.name,
        data: await file.arrayBuffer(),
        size: file.size,
        type: file.type,
        offset: 0,
        isReference: false,
        createdAt: Date.now(),
      };

      await db.saveVideo(newVideo);
      await loadProjectData();
      setSelectedCompVideoId(newVideo.id);
    } catch (err) {
      console.error('Failed to add video:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReplaceVideo = async (videoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    setIsProcessing(true);
    try {
      const updatedVideo: VideoAsset = {
        ...video,
        name: file.name,
        size: file.size,
        type: file.type,
        data: await file.arrayBuffer(),
      };

      await db.saveVideo(updatedVideo);
      await loadProjectData();
    } catch (err) {
      console.error('Failed to replace video:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    if (editingNoteId) {
      const note = notes.find(n => n.id === editingNoteId);
      if (note) {
        const updatedNote = { ...note, text: noteText };
        await db.saveNote(updatedNote);
        setNotes(notes.map(n => n.id === editingNoteId ? updatedNote : n));
      }
    } else {
      const newNote: Note = {
        id: crypto.randomUUID(),
        projectId: project.id,
        timestamp: currentTime,
        text: noteText,
        createdAt: Date.now(),
      };
      await db.saveNote(newNote);
      setNotes([...notes, newNote].sort((a, b) => a.timestamp - b.timestamp));
    }

    setNoteText('');
    setEditingNoteId(null);
    setIsAddingNote(false);
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

  const updateVideoName = async (videoId: string, newName: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video || !newName.trim()) {
      setEditingVideoId(null);
      return;
    }
    if (video.name === newName) {
      setEditingVideoId(null);
      return;
    }
    const updated = { ...video, name: newName };
    await db.saveVideo(updated);
    setVideos(videos.map(v => v.id === videoId ? updated : v));
    setEditingVideoId(null);
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

  const refBlob = referenceVideo ? resolvedBlobs[referenceVideo.id] : undefined;
  const compBlob = comparisonVideo ? resolvedBlobs[comparisonVideo.id] : undefined;

  const refStatus = referenceVideo ? permissionStatus[referenceVideo.id] : 'missing';
  const compStatus = comparisonVideo ? permissionStatus[comparisonVideo.id] : 'missing';

  const renderVideoStatus = (video: VideoAsset, isRef: boolean) => {
    return null;
  };

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
              className="font-bold text-zinc-900 truncate max-w-[200px] md:max-w-md cursor-pointer hover:bg-zinc-50 px-2 py-1 rounded transition-colors"
            >
              {projectName}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              setProcessingMessage('Starting export...');
              setIsProcessing(true);
              try {
                await exportStandaloneHtml(project, videos, notes, selectedCompVideoId, (msg) => {
                  setProcessingMessage(msg);
                });
              } catch (err) {
                console.error('Export failed:', err);
                alert('Export failed. The video files might be too large for your browser to process into a single HTML file.');
              } finally {
                setIsProcessing(false);
                setProcessingMessage('Processing video...');
              }
            }}
            disabled={isProcessing}
            className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-500 transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Export Standalone HTML"
          >
            {isProcessing ? <RefreshCw size={20} className="animate-spin" /> : <Share size={20} />}
            <span className="text-sm font-semibold hidden md:inline">
              {isProcessing ? 'Exporting...' : 'Export'}
            </span>
          </button>
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

      <main className="flex-1 flex flex-col landscape:flex-row md:flex-row overflow-y-auto landscape:overflow-hidden md:overflow-hidden relative">
        {/* Mobile Landscape Reminder */}
        <AnimatePresence>
          {showLandscapeHint && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="landscape:hidden fixed inset-0 z-[100] pointer-events-none flex items-center justify-center p-6 bg-zinc-900/90 backdrop-blur-md"
            >
              <div className="text-center text-white">
                <RefreshCw size={48} className="mx-auto mb-4 animate-spin-slow" />
                <h3 className="text-xl font-bold mb-2">Better in Landscape</h3>
                <p className="text-zinc-400 text-sm">Rotate your phone for the full side-by-side layout.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Area */}
        <div className="flex-none landscape:flex-1 md:flex-1 p-0 bg-black relative overflow-hidden">
          <div className="w-full h-full flex flex-col justify-center">
            {referenceVideo && (
              <div 
                className="relative group w-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => isPlaying && setShowControls(false)}
                onClick={() => setShowControls(true)}
              >
                <VideoSyncPlayer
                  refVideo={referenceVideo}
                  compVideo={comparisonVideo}
                  refBlob={refBlob}
                  compBlob={compBlob}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  isRefMuted={isRefMuted}
                  isCompMuted={isCompMuted}
                  isRefHidden={isRefHidden}
                  onToggleRefMute={() => setIsRefMuted(!isRefMuted)}
                  onToggleCompMute={() => setIsCompMuted(!isCompMuted)}
                  onTimeUpdate={setCurrentTime}
                  onDurationChange={setDuration}
                />

                {/* YouTube-style Controls Overlay */}
                <AnimatePresence>
                  {showControls && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-4 px-4"
                    >
                      {/* Progress Bar */}
                      <div className="relative h-1.5 mb-3 group/progress cursor-pointer">
                        <input
                          type="range"
                          min="0"
                          max={duration || 100}
                          step="0.01"
                          value={currentTime}
                          onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="absolute inset-y-0 left-0 right-0 bg-white/20 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 transition-all duration-100 relative"
                            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-emerald-500 rounded-full shadow-lg scale-0 group-hover/progress:scale-100 transition-transform" />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPlaying(!isPlaying);
                            }}
                            className="text-white hover:text-emerald-400 transition-colors"
                          >
                            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                          </button>
                          
                          <div className="flex items-center gap-2 text-white/90 font-mono text-sm tabular-nums">
                            <span>{formatTimestamp(currentTime)}</span>
                            <span className="text-white/40">/</span>
                            <span className="text-white/60">{formatTimestamp(duration)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsRefHidden(!isRefHidden);
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              isRefHidden ? "text-emerald-400" : "text-white hover:text-emerald-400"
                            )}
                            title={isRefHidden ? "Show Reference" : "Hide Reference"}
                          >
                            {isRefHidden ? <EyeOff size={20} /> : <Eye size={20} />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSettingsOpen(!isSettingsOpen);
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              isSettingsOpen ? "text-emerald-400" : "text-white hover:text-emerald-400"
                            )}
                          >
                            <Settings2 size={20} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                        {/* Reference Video Info */}
                        {referenceVideo && (
                          <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/50">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase">Reference Video</span>
                              <button
                                onClick={() => {
                                  setEditingVideoId(referenceVideo.id);
                                  setTempVideoName(referenceVideo.name);
                                }}
                                className="text-zinc-400 hover:text-zinc-900 transition-colors"
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                            {editingVideoId === referenceVideo.id ? (
                              <input
                                autoFocus
                                type="text"
                                value={tempVideoName}
                                onChange={(e) => setTempVideoName(e.target.value)}
                                onBlur={() => updateVideoName(referenceVideo.id, tempVideoName)}
                                onKeyDown={(e) => e.key === 'Enter' && updateVideoName(referenceVideo.id, tempVideoName)}
                                className="w-full bg-white border border-zinc-200 rounded px-2 py-1 font-medium text-sm focus:ring-2 focus:ring-zinc-900/5 outline-none"
                              />
                            ) : (
                              <p 
                                onClick={() => {
                                  setEditingVideoId(referenceVideo.id);
                                  setTempVideoName(referenceVideo.name);
                                }}
                                className="font-medium text-sm text-zinc-900 cursor-pointer hover:text-zinc-600 transition-colors"
                              >
                                {referenceVideo.name}
                              </p>
                            )}
                          </div>
                        )}
                        {videos.filter(v => !v.isReference).map(v => (
                          <div 
                            key={v.id}
                            className={cn(
                              "p-4 rounded-xl border transition-all cursor-pointer",
                              selectedCompVideoId === v.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-100 hover:border-zinc-300"
                            )}
                            onClick={() => setSelectedCompVideoId(selectedCompVideoId === v.id ? null : v.id)}
                          >
                            <div className="flex items-center justify-between mb-3">
                              {editingVideoId === v.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={tempVideoName}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setTempVideoName(e.target.value)}
                                  onBlur={() => updateVideoName(v.id, tempVideoName)}
                                  onKeyDown={(e) => e.key === 'Enter' && updateVideoName(v.id, tempVideoName)}
                                  className="bg-white border border-zinc-200 rounded px-2 py-1 font-medium text-sm focus:ring-2 focus:ring-zinc-900/5 outline-none flex-1 mr-2"
                                />
                              ) : (
                                <div className="flex items-center gap-2 flex-1 truncate">
                                  <p 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingVideoId(v.id);
                                      setTempVideoName(v.name);
                                    }}
                                    className="font-medium text-sm text-zinc-900 truncate cursor-pointer hover:text-zinc-600 transition-colors"
                                  >
                                    {v.name}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingVideoId(v.id);
                                      setTempVideoName(v.name);
                                    }}
                                    className="text-zinc-400 hover:text-zinc-900 transition-colors"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                </div>
                              )}
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
                                className="text-zinc-400 hover:text-red-500 transition-colors"
                                title="Delete comparison video"
                              >
                                <Trash2 size={20} />
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
        <div className="w-full landscape:w-64 md:w-72 border-t landscape:border-t-0 md:border-t-0 landscape:border-l md:border-l border-zinc-100 bg-white flex flex-col min-h-[400px] landscape:h-auto md:h-auto">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote size={18} className="text-zinc-400" />
              <h2 className="font-bold text-zinc-900 text-sm">Notes</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setIsAddingNote(true);
                }}
                className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                title="Add Note"
              >
                <Plus size={16} />
              </button>
              <span className="text-[10px] font-bold bg-zinc-100 px-2 py-0.5 rounded text-zinc-500">
                {notes.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {notes.map(note => (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-xl p-3 transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentTime(note.timestamp);
                    setIsPlaying(false);
                  }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1 text-zinc-500">
                      <Clock size={12} />
                      <span className="text-[10px] font-mono font-bold">{formatTimestamp(note.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingNoteId(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-900 transition-opacity"
                      >
                        <Info size={12} />
                      </button>
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
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-800 leading-relaxed line-clamp-1">{note.text}</p>
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

      {/* View Note Modal */}
      <AnimatePresence>
        {viewingNoteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
              onClick={() => setViewingNoteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-zinc-900">Note Detail</h3>
                  <div className="flex items-center gap-2 text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
                    <Clock size={16} />
                    <span className="text-sm font-mono font-bold">
                      {formatTimestamp(notes.find(n => n.id === viewingNoteId)?.timestamp || 0)}
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-6 text-zinc-900 whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed">
                  {notes.find(n => n.id === viewingNoteId)?.text}
                </div>
                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => {
                      const note = notes.find(n => n.id === viewingNoteId);
                      if (note) {
                        setNoteText(note.text);
                        setEditingNoteId(note.id);
                        setViewingNoteId(null);
                        setIsAddingNote(true);
                      }
                    }}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <Pencil size={18} />
                    Edit
                  </button>
                  <button
                    onClick={() => setViewingNoteId(null)}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-white bg-zinc-900 hover:bg-zinc-800 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                  <h3 className="text-xl font-bold text-zinc-900">{editingNoteId ? 'Edit Note' : 'Add Note'}</h3>
                  <div className="flex items-center gap-2 text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-xl border border-zinc-100">
                    <Clock size={16} />
                    <span className="text-sm font-mono font-bold">
                      {formatTimestamp(editingNoteId ? notes.find(n => n.id === editingNoteId)?.timestamp || currentTime : currentTime)}
                    </span>
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
                    onClick={() => {
                      setIsAddingNote(false);
                      setEditingNoteId(null);
                      setNoteText('');
                    }}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim()}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-zinc-200"
                  >
                    {editingNoteId ? 'Update Note' : 'Save Note'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <LoadingOverlay isVisible={isProcessing} message={processingMessage} />
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processing video...');
  
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  
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

    setProcessingMessage('Creating project...');
    setIsProcessing(true);
    try {
      const projectId = crypto.randomUUID();
      const newProject: Project = {
        id: projectId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        createdAt: Date.now(),
      };

      const refVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId,
        name: file.name,
        data: await file.arrayBuffer(),
        size: file.size,
        type: file.type,
        offset: 0,
        isReference: true,
        createdAt: Date.now(),
      };

      await db.saveProject(newProject);
      await db.saveVideo(refVideo);
      
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImportHtml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingMessage('Importing project from HTML...');
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const htmlContent = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
      });

      const newProject = await importFromHtml(htmlContent);
      
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject);
    } catch (err) {
      console.error('Failed to import project:', err);
      alert('Failed to import project. Please ensure the HTML file is a valid VideoNote export.');
    } finally {
      setIsProcessing(false);
      setIsCreateMenuOpen(false);
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

  return (
    <>
      {isLoading ? (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <div className="animate-pulse text-zinc-400 font-medium">Loading VideoNote...</div>
        </div>
      ) : currentProject ? (
        <ProjectViewer 
          project={currentProject} 
          onBack={() => setCurrentProject(null)}
          onConfirmDelete={(config) => setConfirmConfig({ ...config, isOpen: true })}
          onProjectUpdate={(updated) => {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
            setCurrentProject(updated);
          }}
        />
      ) : (
        <div className="min-h-screen bg-zinc-50 p-6 md:p-12">
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between mb-12">
              <div>
                <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">VideoNote</h1>
                <p className="text-zinc-500 mt-2">Annotate and compare videos with precision.</p>
              </div>
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
                  {projects.map((p) => (
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

          {/* FAB for mobile/desktop */}
          <div className="fixed bottom-8 right-8 z-40 flex flex-col items-end gap-3">
            <AnimatePresence>
              {isCreateMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 20 }}
                  className="bg-white border border-zinc-200 rounded-2xl shadow-2xl p-2 mb-2 flex flex-col gap-1 min-w-[200px]"
                >
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                  >
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                      <Video size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 text-sm">New Video Project</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Start from scratch</div>
                    </div>
                  </button>
                  <button
                    onClick={() => htmlInputRef.current?.click()}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                  >
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                      <Share size={18} />
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900 text-sm">Import HTML Project</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Load previous export</div>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
              className={cn(
                "w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center shadow-2xl hover:bg-zinc-800 transition-all group",
                isCreateMenuOpen && "rotate-45 bg-zinc-700"
              )}
            >
              <Plus size={32} className="transition-transform duration-300" />
            </button>
            
            <input 
              ref={videoInputRef}
              type="file" 
              accept="video/*" 
              className="hidden" 
              onChange={(e) => {
                handleCreateProject(e);
                setIsCreateMenuOpen(false);
              }} 
            />
            <input 
              ref={htmlInputRef}
              type="file" 
              accept=".html" 
              className="hidden" 
              onChange={handleImportHtml} 
            />
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
      />

      <LoadingOverlay isVisible={isProcessing} message={processingMessage} />
    </>
  );
}

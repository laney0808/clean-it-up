/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, Video, Trash2, ChevronLeft, Play, Pause, SkipBack, SkipForward, StickyNote, Clock, Settings2, X, AlertTriangle, RefreshCw, FileVideo, ShieldCheck, Share, Volume2, VolumeX, Pencil, Eye, EyeOff, Info, FileJson, Archive, Download, Upload, FileText, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, Project, VideoAsset, Note } from './db';
import { cn, formatTimestamp, getFileNameWithoutExtension, splitFileName } from './utils';
import { exportProjectZip, exportProjectJson, exportProjectText } from './exporter';
import { importFromHtml, importFromJson } from './importer';

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
  message,
  confirmText = "Delete",
  confirmVariant = "danger"
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void; 
  title: string; 
  message: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'primary';
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
              className={cn(
                "flex-1 px-6 py-3 rounded-xl font-semibold text-white transition-colors shadow-lg",
                confirmVariant === 'danger' ? "bg-red-500 hover:bg-red-600 shadow-red-100" : "bg-zinc-900 hover:bg-zinc-800 shadow-zinc-100"
              )}
            >
              {confirmText}
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
  onDurationChange,
  onRegisterVideo
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
  onRegisterVideo?: (id: string, el: HTMLVideoElement | null) => void;
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

  useEffect(() => {
    const ref = refVideoRef.current;
    if (ref && refUrl) {
      // Force reload when URL changes
      ref.load();
    }
  }, [refUrl]);

  useEffect(() => {
    const comp = compVideoRef.current;
    if (comp && compUrl) {
      // Force reload when URL changes
      comp.load();
    }
  }, [compUrl]);

  // Sync playback state - run when isPlaying OR when URLs are ready
  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    if (isPlaying) {
      const playRef = () => ref.play().catch(() => {});
      const playComp = () => comp?.play().catch(() => {});

      if (ref.readyState >= 2) {
        playRef();
      } else {
        ref.oncanplay = playRef;
      }

      if (comp) {
        if (comp.readyState >= 2) {
          playComp();
        } else {
          comp.oncanplay = playComp;
        }
      }
    } else {
      ref.pause();
      if (ref.oncanplay) ref.oncanplay = null;
      if (comp) {
        comp.pause();
        if (comp.oncanplay) comp.oncanplay = null;
      }
    }
  }, [isPlaying, refUrl, compUrl]);

  // Sync current time only on seek or initial load
  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    // Only sync if the difference is significant (seeking) or if we are exactly setting it
    const threshold = isPlaying ? 0.3 : 0.01;
    if (Math.abs(ref.currentTime - currentTime) > threshold) {
      ref.currentTime = currentTime;
    }

    if (comp && compVideo) {
      const compTime = currentTime + compVideo.offset;
      if (Math.abs(comp.currentTime - compTime) > threshold) {
        comp.currentTime = Math.max(0, compTime);
      }
    }
  }, [currentTime, compVideo?.offset, isPlaying]);

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
              ref={(el) => {
                // @ts-ignore
                refVideoRef.current = el;
                onRegisterVideo?.(refVideo.id, el);
              }}
              className="w-full h-full object-contain"
              onTimeUpdate={handleRefTimeUpdate}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (!isNaN(d) && isFinite(d)) {
                  onDurationChange(d);
                }
              }}
              playsInline
              muted={isRefMuted}
              preload="auto"
            >
              <source src={refUrl} type={refVideo.type} />
            </video>
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
          ref={(el) => {
            // @ts-ignore
            refVideoRef.current = el;
            onRegisterVideo?.(refVideo.id, el);
          }}
          className="hidden"
          onTimeUpdate={handleRefTimeUpdate}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (!isNaN(d) && isFinite(d)) {
              onDurationChange(d);
            }
          }}
          playsInline
          muted={isRefMuted}
          preload="auto"
        >
          <source src={refUrl} type={refVideo.type} />
        </video>
      )}

      {compVideo && (
        <div className="relative aspect-video bg-black overflow-hidden shadow-inner">
          {compUrl && (
            <video
              ref={(el) => {
                // @ts-ignore
                compVideoRef.current = el;
                onRegisterVideo?.(compVideo.id, el);
              }}
              className="w-full h-full object-contain"
              playsInline
              muted={isCompMuted}
              preload="auto"
            >
              <source src={compUrl} type={compVideo.type} />
            </video>
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

interface MissingVideosTask {
  projectId: string;
  missingVideos: { id: string; name: string; isReference: boolean; offset: number }[];
  onComplete: () => void;
}

const MissingVideosModal = ({ task, onClose }: { task: MissingVideosTask; onClose: () => void }) => {
  const [files, setFiles] = useState<{ [id: string]: File }>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (id: string, file: File | undefined) => {
    if (file) {
      setFiles(prev => ({ ...prev, [id]: file }));
    }
  };

  const handleImport = async () => {
    setIsProcessing(true);
    try {
      for (const video of task.missingVideos) {
        const file = files[video.id];
        if (file) {
          const type = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
          const videoAsset: VideoAsset = {
            id: video.id,
            projectId: task.projectId,
            name: file.name,
            data: await file.arrayBuffer(),
            size: file.size,
            type: type,
            offset: video.offset,
            isReference: video.isReference,
            createdAt: Date.now(),
          };
          await db.saveVideo(videoAsset);
        }
      }
      task.onComplete();
      onClose();
    } catch (err) {
      console.error('Failed to import videos:', err);
      alert('Failed to import some videos. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
              <Upload size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Link Video Files</h2>
              <p className="text-sm text-zinc-500">Please select the video files used in this project.</p>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {task.missingVideos.map(v => (
              <div key={v.id} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 italic flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-700">
                    {v.isReference ? 'Reference' : 'Comparison'}: {getFileNameWithoutExtension(v.name)}
                  </span>
                  {files[v.id] && <ShieldCheck size={16} className="text-emerald-500" />}
                </div>
                <input 
                  type="file" 
                  accept="video/*"
                  onChange={(e) => handleFileChange(v.id, e.target.files?.[0])}
                  className="text-xs text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-zinc-100 text-zinc-600 font-semibold rounded-2xl hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isProcessing || Object.keys(files).length === 0}
              className="flex-1 px-6 py-3 bg-zinc-900 text-white font-semibold rounded-2xl hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
              Finish Import
            </button>
          </div>
        </div>
      </motion.div>
    </div>
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
  
  const [sidebarTab, setSidebarTab] = useState<'notes' | 'videos'>('notes');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedCompVideoId, setSelectedCompVideoId] = useState<string | null>(null);

  const referenceVideo = useMemo(() => videos.find(v => v.isReference), [videos]);
  const comparisonVideo = useMemo(() => videos.find(v => v.id === selectedCompVideoId), [videos, selectedCompVideoId]);
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
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [showTextExportSubmenu, setShowTextExportSubmenu] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [viewingNoteId, setViewingNoteId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [tempVideoName, setTempVideoName] = useState('');
  const [inlineEditingText, setInlineEditingText] = useState('');
  const [showControls, setShowControls] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const notesScrollRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const activeNoteId = useMemo(() => {
    if (notes.length === 0) return null;
    const sortedNotes = [...notes].sort((a, b) => a.timestamp - b.timestamp);
    let activeId = null;
    for (let i = 0; i < sortedNotes.length; i++) {
      if (currentTime >= sortedNotes[i].timestamp) {
        activeId = sortedNotes[i].id;
      } else {
        break;
      }
    }
    return activeId;
  }, [notes, currentTime]);

  useEffect(() => {
    if (activeNoteId && noteRefs.current.has(activeNoteId) && notesScrollRef.current) {
      const el = noteRefs.current.get(activeNoteId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeNoteId]);

  const [showLandscapeHint, setShowLandscapeHint] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowLandscapeHint(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      // Robust sync on pause
      const ref = videoRefs.current.get(referenceVideo?.id || '');
      if (ref) {
        setCurrentTime(ref.currentTime);
      }
    }
  }, [isPlaying, referenceVideo?.id]);

  const [showStatusIndicator, setShowStatusIndicator] = useState(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const handleShowStatus = () => {
    console.info('--- PROJECT STATUS DEBUG ---');
    console.info('Project ID:', project.id);
    console.info('Project Name:', project.name);
    console.info('Timeline Position:', formatTimestamp(currentTime));
    
    // Log individual video states
    videoRefs.current.forEach((ref, id) => {
      const video = videos.find(v => v.id === id);
      if (video && ref) {
        console.info(`Video: ${video.name}`);
        console.info(`  - Offset: ${video.offset.toFixed(3)}s`);
        console.info(`  - Actual Playtime (File Time): ${ref.currentTime.toFixed(3)}s`);
        console.info(`  - Sync Position (Timeline): ${(ref.currentTime - video.offset).toFixed(3)}s`);
      }
    });

    console.info('----------------------------');
    
    // Provide visual feedback
    setShowStatusIndicator(true);
    setTimeout(() => setShowStatusIndicator(false), 2000);
  };

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
      const type = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
      const newVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: file.name,
        data: await file.arrayBuffer(),
        size: file.size,
        type: type,
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
      const type = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
      const updatedVideo: VideoAsset = {
        ...video,
        name: file.name,
        size: file.size,
        type: type,
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

  const handleInlineNoteUpdate = async (noteId: string, newText: string) => {
    const note = notes.find(n => n.id === noteId);
    if (note && newText.trim() && note.text !== newText) {
      const updatedNote = { ...note, text: newText };
      await db.saveNote(updatedNote);
      setNotes(notes.map(n => n.id === noteId ? updatedNote : n));
    }
    setEditingNoteId(null);
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
    if (getFileNameWithoutExtension(video.name) === newName) {
      setEditingVideoId(null);
      return;
    }
    const { extension } = splitFileName(video.name);
    const updated = { ...video, name: newName + extension };
    await db.saveVideo(updated);
    setVideos(videos.map(v => v.id === videoId ? updated : v));
    setEditingVideoId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isTextualInput = 
        (target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit'].includes((target as HTMLInputElement).type)) ||
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable;

      // Handle Enter and Shift+Enter inside textarea/editing specifically
      if (isTextualInput) {
        if (e.key === 'Enter') {
          if (e.shiftKey) {
            // Standard behavior: Allow new line
            return;
          } else {
            // Intercept single Enter to save
            e.preventDefault();
            if (isAddingNote) {
              handleAddNote();
            } else if (editingNoteId) {
              handleInlineNoteUpdate(editingNoteId, inlineEditingText);
            }
          }
        }
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          // Navigate to previous note
          const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
          // Find the last note that is before current time
          const prevNote = [...sorted].reverse().find(n => n.timestamp < currentTime - 0.1);
          if (prevNote) {
            setCurrentTime(prevNote.timestamp);
            setExpandedNoteId(prevNote.id);
          }
        } else {
          setCurrentTime(prev => Math.max(0, prev - 1/30));
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          // Navigate to next note
          const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);
          const nextNote = sorted.find(n => n.timestamp > currentTime + 0.1);
          if (nextNote) {
            setCurrentTime(nextNote.timestamp);
            setExpandedNoteId(nextNote.id);
          }
        } else {
          setCurrentTime(prev => duration > 0 ? Math.min(duration, prev + 1/30) : prev + 1/30);
        }
      } else if (e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setNoteText('');
        setEditingNoteId(null);
        setIsAddingNote(true);
        setIsPlaying(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, notes, currentTime, isAddingNote, editingNoteId, inlineEditingText, handleAddNote, handleInlineNoteUpdate]);

  const updateVideoOffset = async (videoId: string, offset: number) => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return;
    
    const updated = { ...video, offset };
    await db.saveVideo(updated);
    setVideos(videos.map(v => v.id === videoId ? updated : v));
  };

  const refBlob = referenceVideo ? resolvedBlobs[referenceVideo.id] : undefined;
  const compBlob = comparisonVideo ? resolvedBlobs[comparisonVideo.id] : undefined;

  const refStatus = referenceVideo ? permissionStatus[referenceVideo.id] : 'missing';
  const compStatus = comparisonVideo ? permissionStatus[comparisonVideo.id] : 'missing';

  const renderVideoStatus = (video: VideoAsset, isRef: boolean) => {
    return null;
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
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
        <div className="flex items-center gap-2 relative">
          <button 
            onClick={handleShowStatus}
            className={cn(
              "p-2 rounded-xl transition-all flex items-center gap-2",
              showStatusIndicator ? "bg-emerald-100 text-emerald-600" : "hover:bg-zinc-100 text-zinc-500"
            )}
            title="Debug Status"
          >
            {showStatusIndicator ? <ShieldCheck size={20} /> : <Info size={20} />}
            <span className="text-sm font-semibold hidden md:inline">
              {showStatusIndicator ? 'Logged!' : 'Status'}
            </span>
          </button>

          <button 
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            disabled={isProcessing}
            className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-500 transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Export"
          >
            {isProcessing ? <RefreshCw size={20} className="animate-spin" /> : <Share size={20} />}
            <span className="text-sm font-semibold hidden md:inline">
              {isProcessing ? 'Exporting...' : 'Export'}
            </span>
          </button>

          <AnimatePresence>
            {isExportMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute right-0 top-full mt-2 w-64 bg-white border border-zinc-100 rounded-2xl shadow-2xl p-1 z-50 overflow-hidden"
              >
                {!showTextExportSubmenu ? (
                  <div className="flex flex-col">
                    <button
                      onClick={async () => {
                        setIsExportMenuOpen(false);
                        setProcessingMessage('Preparing ZIP export...');
                        setIsProcessing(true);
                        try {
                          await exportProjectZip(project, videos, notes, selectedCompVideoId, isRefHidden, (msg) => {
                            setProcessingMessage(msg);
                          });
                        } catch (err) {
                          console.error('Export failed:', err);
                          alert('Export failed. Please try again.');
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                    >
                      <Archive size={18} className="text-zinc-500" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-700">ZIP File</span>
                        <span className="text-[10px] text-zinc-400">Project data + video files</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        exportProjectJson(project, videos, notes);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                    >
                      <FileJson size={18} className="text-zinc-500" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-700">Project JSON</span>
                        <span className="text-[10px] text-zinc-400">Metadata & notes only</span>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowTextExportSubmenu(true);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <FileText size={18} className="text-zinc-500" />
                        <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-700">Pure Text</span>
                        <span className="text-[10px] text-zinc-400">Formatted notes list</span>
                      </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-300" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <div className="px-3 py-2 border-b border-zinc-50 flex items-center gap-2">
                      <button 
                        onClick={() => setShowTextExportSubmenu(false)}
                        className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Select Reference Video</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {videos.map(v => (
                        <button
                          key={v.id}
                          onClick={() => {
                            exportProjectText(project, notes, v);
                            setIsExportMenuOpen(false);
                            setShowTextExportSubmenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 rounded-xl transition-colors text-left"
                        >
                          <Video size={16} className={cn(v.isReference ? "text-blue-500" : "text-emerald-500")} />
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-sm font-medium text-zinc-700 truncate">{getFileNameWithoutExtension(v.name)}</span>
                            <span className="text-[10px] text-zinc-400 truncate">Offset: {v.offset?.toFixed(2)}s</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => {
              setSidebarTab('videos');
              setIsSettingsOpen(false); // Close inline if it was open (though we're removing it)
            }}
            className={cn(
              "p-2 rounded-xl transition-colors",
              (isSettingsOpen || (sidebarTab === 'videos')) ? "bg-zinc-900 text-white" : "hover:bg-zinc-100 text-zinc-500"
            )}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col landscape:flex-row md:flex-row overflow-hidden relative min-h-0">
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
        <div className="flex-none landscape:flex-1 md:flex-1 p-0 bg-black relative overflow-hidden min-h-0">
          <div className="w-full landscape:h-full md:h-full flex flex-col justify-center">
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
                  onRegisterVideo={(id, el) => {
                    if (el) videoRefs.current.set(id, el);
                    else videoRefs.current.delete(id);
                  }}
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
                              setSidebarTab('videos');
                            }}
                            className={cn(
                              "p-2 rounded-lg transition-colors",
                              sidebarTab === 'videos' ? "text-emerald-400" : "text-white hover:text-emerald-400"
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

          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full landscape:w-72 md:w-80 border-t landscape:border-t-0 md:border-t-0 landscape:border-l md:border-l border-zinc-100 bg-white flex flex-col flex-1 landscape:flex-none md:flex-none min-h-0">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-zinc-100">
            <button
              onClick={() => setSidebarTab('notes')}
              className={cn(
                "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
                sidebarTab === 'notes' ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-600"
              )}
            >
              Notes
            </button>
            <button
              onClick={() => setSidebarTab('videos')}
              className={cn(
                "flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2",
                sidebarTab === 'videos' ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-400 hover:text-zinc-600"
              )}
            >
              Videos
            </button>
          </div>

          <AnimatePresence mode="wait">
            {sidebarTab === 'notes' ? (
              <motion.div 
                key="notes-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="p-4 border-b border-zinc-50 flex items-center justify-between bg-zinc-50/30">
                  <div className="flex items-center gap-2">
                    <StickyNote size={16} className="text-zinc-400" />
                    <h2 className="font-bold text-zinc-900 text-xs">Project Notes</h2>
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
                      <Plus size={14} />
                    </button>
                    <span className="text-[10px] font-bold bg-white border border-zinc-100 px-2 py-0.5 rounded text-zinc-500">
                      {notes.length}
                    </span>
                  </div>
                </div>

                <div 
                  ref={notesScrollRef}
                  className="flex-1 overflow-y-auto p-3 space-y-2 scroll-smooth"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {notes.map(note => {
                      const isActive = activeNoteId === note.id;
                      const isExpanded = expandedNoteId === note.id;
                      const isEditing = editingNoteId === note.id;
                      
                      return (
                        <div key={note.id} className="relative overflow-hidden rounded-xl bg-zinc-50">
                          <motion.div
                            ref={(el) => {
                              if (el) noteRefs.current.set(note.id, el);
                              else noteRefs.current.delete(note.id);
                            }}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ 
                              opacity: 1, 
                              x: 0,
                              backgroundColor: isActive ? 'rgb(236 253 245)' : 'rgb(250 250 250)',
                              borderColor: isActive ? 'rgb(16 185 129)' : 'rgb(244 244 245)'
                            }}
                            transition={{
                              layout: { type: 'spring', bounce: 0, duration: 0.3 },
                              opacity: { duration: 0.2 },
                              x: { type: 'spring', bounce: 0.1, duration: 0.4 }
                            }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={cn(
                              "relative group border p-3 transition-all cursor-pointer z-10 select-none",
                              isActive ? "shadow-sm" : "hover:bg-zinc-100"
                            )}
                            onClick={() => {
                              if (isEditing) return;
                              if (isExpanded) {
                                setExpandedNoteId(null);
                              } else {
                                setCurrentTime(note.timestamp);
                                setIsPlaying(false);
                                setExpandedNoteId(note.id);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-1.5 pointer-events-none">
                              <div className="flex items-center gap-1.5">
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full transition-all",
                                  isActive ? "bg-emerald-500 scale-125 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-transparent scale-100"
                                )} />
                                <div className="flex items-center gap-1 text-zinc-500">
                                  <Clock size={12} />
                                  <span className="text-[10px] font-mono font-bold">
                                    {formatTimestamp(note.timestamp)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 pointer-events-auto">
                                {isExpanded && !isEditing && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingNoteId(note.id);
                                      setInlineEditingText(note.text);
                                    }}
                                    className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors"
                                    title="Edit Note"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                )}
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
                                  className={cn(
                                    "p-1 text-zinc-400 hover:text-red-500 transition-all",
                                    isExpanded || isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                  )}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            
                            {isEditing ? (
                              <textarea
                                autoFocus
                                value={inlineEditingText}
                                onChange={(e) => setInlineEditingText(e.target.value)}
                                onBlur={() => handleInlineNoteUpdate(note.id, inlineEditingText)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-900 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                                rows={Math.max(2, inlineEditingText.split('\n').length)}
                              />
                            ) : (
                              <p className={cn(
                                "text-xs text-zinc-800 leading-relaxed transition-all pointer-events-none",
                                isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"
                              )}>
                                {note.text}
                              </p>
                            )}
                          </motion.div>
                        </div>
                      );
                    })}
                  </AnimatePresence>
                  {notes.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-12">
                      <StickyNote size={32} className="mb-3 opacity-20" />
                      <p className="text-sm">No notes yet</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="videos-tab"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="p-4 border-b border-zinc-50 flex items-center justify-between bg-zinc-50/30">
                  <div className="flex items-center gap-2">
                    <Video size={16} className="text-zinc-400" />
                    <h2 className="font-bold text-zinc-900 text-xs">Manage Videos</h2>
                  </div>
                  <label className="p-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors shadow-sm cursor-pointer">
                    <Plus size={14} />
                    <input type="file" accept="video/*" className="hidden" onChange={handleAddVideo} />
                  </label>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  {/* Reference Video section */}
                  {referenceVideo && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Reference</span>
                      </div>
                      <div className="p-3 rounded-xl border border-blue-100 bg-blue-50/30">
                        <div className="flex items-center justify-between mb-2">
                          {editingVideoId === referenceVideo.id ? (
                            <input
                              autoFocus
                              type="text"
                              value={tempVideoName}
                              onChange={(e) => setTempVideoName(e.target.value)}
                              onBlur={() => updateVideoName(referenceVideo.id, tempVideoName)}
                              onKeyDown={(e) => e.key === 'Enter' && updateVideoName(referenceVideo.id, tempVideoName)}
                              className="flex-1 bg-white border border-zinc-200 rounded px-2 py-1 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          ) : (
                            <span 
                              className="text-xs font-semibold text-zinc-900 truncate"
                              onClick={() => {
                                setEditingVideoId(referenceVideo.id);
                                setTempVideoName(getFileNameWithoutExtension(referenceVideo.name));
                              }}
                            >
                              {getFileNameWithoutExtension(referenceVideo.name)}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                             <button
                              onClick={() => {
                                setEditingVideoId(referenceVideo.id);
                                setTempVideoName(getFileNameWithoutExtension(referenceVideo.name));
                              }}
                              className="p-1 text-zinc-400 hover:text-zinc-900"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                          <Clock size={10} />
                          <span>Main timeline source</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Comparison Videos section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Comparisons</span>
                    </div>
                    <div className="space-y-2">
                      {videos.filter(v => !v.isReference).map(v => (
                        <div 
                          key={v.id}
                          className={cn(
                            "p-3 rounded-xl border transition-all cursor-pointer",
                            selectedCompVideoId === v.id ? "border-emerald-500 bg-emerald-50/30" : "border-zinc-100 bg-zinc-50/50 hover:border-zinc-200"
                          )}
                          onClick={() => setSelectedCompVideoId(selectedCompVideoId === v.id ? null : v.id)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1 min-w-0 pr-2">
                              {editingVideoId === v.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={tempVideoName}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setTempVideoName(e.target.value)}
                                  onBlur={() => updateVideoName(v.id, tempVideoName)}
                                  onKeyDown={(e) => e.key === 'Enter' && updateVideoName(v.id, tempVideoName)}
                                  className="w-full bg-white border border-zinc-200 rounded px-2 py-1 text-xs font-semibold outline-none"
                                />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-zinc-900 truncate">{getFileNameWithoutExtension(v.name)}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingVideoId(v.id);
                                      setTempVideoName(getFileNameWithoutExtension(v.name));
                                    }}
                                    className="p-1 text-zinc-300 hover:text-zinc-600"
                                  >
                                    <Pencil size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
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
                              className="text-zinc-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-zinc-400 font-bold uppercase">Offset</span>
                            <OffsetInput 
                              value={v.offset} 
                              onChange={(newOffset) => updateVideoOffset(v.id, newOffset)} 
                            />
                            <span className="text-[10px] text-zinc-400 font-mono">s</span>
                          </div>
                        </div>
                      ))}
                      {videos.filter(v => !v.isReference).length === 0 && (
                        <div className="py-8 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 rounded-xl">
                          No comparisons linked
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
  
  const [missingVideosTask, setMissingVideosTask] = useState<MissingVideosTask | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmVariant?: 'danger' | 'primary';
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
      const type = file.type || (file.name.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
      const newProject: Project = {
        id: projectId,
        name: getFileNameWithoutExtension(file.name),
        createdAt: Date.now(),
      };

      const refVideo: VideoAsset = {
        id: crypto.randomUUID(),
        projectId,
        name: file.name,
        data: await file.arrayBuffer(),
        size: file.size,
        type: type,
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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();

      if (file.name.endsWith('.html')) {
        setProcessingMessage('Importing project from HTML...');
        const htmlContent = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file);
        });

        const newProject = await importFromHtml(htmlContent);
        setProjects([newProject, ...projects]);
        setCurrentProject(newProject);
      } else if (file.name.endsWith('.json')) {
        setProcessingMessage('Importing project metadata...');
        const jsonContent = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsText(file);
        });

        const { project, missingVideos } = await importFromJson(jsonContent);
        
        if (missingVideos.length > 0) {
          setMissingVideosTask({
            projectId: project.id,
            missingVideos,
            onComplete: () => {
              setProjects([project, ...projects]);
              setCurrentProject(project);
            }
          });
        } else {
          setProjects([project, ...projects]);
          setCurrentProject(project);
        }
      }
    } catch (err) {
      console.error('Failed to import project:', err);
      if (err instanceof Error && err.message === 'PROJECT_COLLISION') {
        setConfirmConfig({
          isOpen: true,
          title: 'Import Collision',
          message: 'A project with the same ID already exists in your library. Import has been aborted to prevent overwriting your existing work.',
          confirmText: 'OK',
          confirmVariant: 'primary',
          onConfirm: () => {}
        });
      } else {
        alert('Failed to import project. Please ensure the file is a valid export.');
      }
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
          <div className="animate-pulse text-zinc-400 font-medium flex items-center gap-2">
            Loading VideoNote
            <span className="text-[10px] opacity-50">v1.1</span>
          </div>
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
                <div className="flex items-baseline gap-3">
                  <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">VideoNote</h1>
                  <span className="text-sm font-medium text-zinc-400">v1.1</span>
                </div>
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
                      <div className="font-bold text-zinc-900 text-sm">Import Project</div>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">HTML or JSON export</div>
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
              accept="video/*,video/webm,.webm" 
              className="hidden" 
              onChange={(e) => {
                handleCreateProject(e);
                setIsCreateMenuOpen(false);
              }} 
            />
            <input 
              ref={htmlInputRef}
              type="file" 
              accept=".html,.json" 
              className="hidden" 
              onChange={handleImportFile} 
            />
          </div>
        </div>
      )}

      {missingVideosTask && (
        <MissingVideosModal 
          task={missingVideosTask} 
          onClose={() => setMissingVideosTask(null)} 
        />
      )}

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmVariant={confirmConfig.confirmVariant}
      />

      <LoadingOverlay isVisible={isProcessing} message={processingMessage} />
    </>
  );
}

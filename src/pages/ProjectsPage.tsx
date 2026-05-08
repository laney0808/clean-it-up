import React, { useEffect, useRef, useState } from 'react';
import { Plus, Share, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from '../router';
import { db, type Project, type VideoAsset } from '../db';
import { importFromHtml } from '../importer';
import { cn } from '../utils';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { ProjectCard } from '../components/ProjectCard';
import { pickAndStoreFile } from '../utils/fileStorage';
import type { ClipEntry } from '../types/clip';

// Imperative handle for ProjectPage to call
interface OmniPlayerHandle {
  seek: (ms: number) => Promise<void>
  setOffset: (clipId: number, startTime: number) => Promise<void>
}

// Props
interface OmniPlayerProps {
  isEditing: boolean
  clips: ClipEntry[]
  clipsConfirmed: boolean           // ProjectPage flips this to true to trigger rebuild
  onClipsRebuildDone: () => void    // OmniPlayer calls this after rebuild, resets confirmed
  onTimeUpdate: (ms: number) => void  // fires on each tick, ProjectPage updates its UI
}

export default function ProjectsPage() {
  const navigate = useNavigate();

  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Processing video...');

  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  // ProjectPage holds this ref and calls methods on it
  const playerRef = useRef<OmniPlayerHandle>(null)
  const isEditing = useState(false)

  // ProjectPage can then do:
  // playerRef.current.seek(2000)
  // playerRef.current.setOffset(clipId, 3000)
  // playerRef.current.rebuild()  // after clips[] changes

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

  const handleCreateProject = async () => {
    setProcessingMessage('Creating project...');
    setIsProcessing(true);
    try {
      const projectId = crypto.randomUUID();
      const videoId = crypto.randomUUID();
      const { ref, file } = await pickAndStoreFile(videoId)

      const newProject: Project = {
        id: projectId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        createdAt: Date.now(),
      };
      const refVideo: VideoAsset = {
        id: videoId,
        projectId,
        name: file.name,
        fileRef: ref,
        size: file.size,
        type: file.type,
        offset: 0,
        isReference: true,
        createdAt: Date.now(),
      };

      await db.saveProject(newProject);
      await db.saveVideo(refVideo);

      setProjects((prev) => [newProject, ...prev]);
      navigate(`/project/${newProject.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsProcessing(false);
      setIsCreateMenuOpen(false);
    }
  };

  const handleImport = async () => {
    // to be implemented
    return;
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project and all its data? This action cannot be undone.',
      onConfirm: async () => {
        await db.deleteProject(id);
        setProjects((prev) => prev.filter((p) => p.id !== id));
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-pulse text-zinc-400 font-medium">Loading VideoNote...</div>
      </div>
    );
  }

  return (
    <>
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
                    onClick={() => navigate(`/project/${p.id}`)}
                    onDelete={(ev) => handleDeleteProject(p.id, ev)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

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
                  onClick={handleCreateProject}
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
                  onClick={handleImport}
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
              'w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center shadow-2xl hover:bg-zinc-800 transition-all group',
              isCreateMenuOpen && 'rotate-45 bg-zinc-700'
            )}
          >
            <Plus size={32} className="transition-transform duration-300" />
          </button>
        </div>
      </div>

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

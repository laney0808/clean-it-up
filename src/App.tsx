/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { getComponents } from '@omnimedia/omniclip/x/get-components.js';
import { registerElements } from '@omnimedia/omniclip/x/tools/register-elements.js';
import { registerConstructEditorElement } from './omniclip';
import { db, Project, ProjectVideo } from './db';
import { deleteOmniVideoFile, putOmniVideoFile } from './omniDb';
import { OmniClipProjectView } from './OmniClipProjectView';

registerElements(getComponents());
registerConstructEditorElement();

const ProjectCard = ({
  project,
  onClick,
  onDelete,
}: {
  project: Project;
  onClick: () => void;
  onDelete: (event: React.MouseEvent) => void;
  key?: React.Key;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    onClick={onClick}
    className="group relative bg-white border border-zinc-200 rounded-2xl p-6 cursor-pointer hover:border-zinc-400 transition-all shadow-sm hover:shadow-md"
  >
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-3 bg-zinc-100 rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-colors">
          <Video size={24} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 text-lg truncate">{project.title}</h3>
          <p className="text-sm text-zinc-500">
            {project.videoIds.length} {project.videoIds.length === 1 ? 'video' : 'videos'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(event);
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
              className="flex-1 px-6 py-3 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
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
  message,
}: {
  isVisible: boolean;
  message: string;
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
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-zinc-900 font-semibold text-lg"
        >
          {message}
        </motion.p>
      </motion.div>
    )}
  </AnimatePresence>
);

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Creating project...');
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

  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    const allProjects = await db.getProjects();
    setProjects(allProjects.sort((a, b) => b.createdAt - a.createdAt));
    setIsLoading(false);
  };

  const handleCreateProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProcessingMessage('Creating project...');
    setIsProcessing(true);

    try {
      const projectId = crypto.randomUUID();
      const omniProjectId = crypto.randomUUID();
      const videoId = crypto.randomUUID();
      const omniFileKey = `${omniProjectId}:${videoId}`;
      const now = Date.now();

      const newProject: Project = {
        id: projectId,
        title: file.name.replace(/\.[^/.]+$/, ''),
        omniProjectId,
        videoIds: [videoId],
        createdAt: now,
      };

      const referenceVideo: ProjectVideo = {
        id: videoId,
        projectId,
        displayName: file.name,
        omniFileKey,
        role: 'reference',
        startAt: 0,
        createdAt: now,
      };

      await putOmniVideoFile(omniFileKey, file);
      await db.saveProject(newProject);
      await db.saveProjectVideo(referenceVideo);

      setProjects((current) => [newProject, ...current]);
      setCurrentProject(newProject);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  const handleDeleteProject = (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Project',
      message: 'Delete this project and remove its saved OmniClip media references?',
      onConfirm: async () => {
        const projectVideos = await db.getProjectVideos(project.id);

        await Promise.all(projectVideos.map((video) => deleteOmniVideoFile(video.omniFileKey)));
        await db.deleteProject(project.id);

        setProjects((current) => current.filter((entry) => entry.id !== project.id));
        setCurrentProject((current) => (current?.id === project.id ? null : current));
      },
    });
  };

  return (
    <>
      {isLoading ? (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
          <div className="animate-pulse text-zinc-400 font-medium">Loading VideoNote...</div>
        </div>
      ) : currentProject ? (
        <OmniClipProjectView
          project={currentProject}
          onBack={() => setCurrentProject(null)}
          onProjectUpdate={(updatedProject) => {
            setProjects((current) =>
              current.map((project) => (project.id === updatedProject.id ? updatedProject : project)),
            );
            setCurrentProject(updatedProject);
          }}
        />
      ) : (
        <div className="min-h-screen bg-zinc-50 p-6 md:p-12">
          <div className="max-w-5xl mx-auto">
            <header className="flex items-center justify-between mb-12 gap-4">
              <div>
                <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">VideoNote</h1>
                <p className="text-zinc-500 mt-2">
                  Project metadata stays here; uploaded video files go straight into OmniClip storage.
                </p>
              </div>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="px-5 py-3 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 transition-colors font-semibold"
              >
                New Project
              </button>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleCreateProject}
              />
            </header>

            {projects.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-20 text-center">
                <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-zinc-400">
                  <Video size={32} />
                </div>
                <h2 className="text-xl font-semibold text-zinc-900">No projects yet</h2>
                <p className="text-zinc-500 mt-2 max-w-sm mx-auto">
                  Upload a reference video to create a project. Additional videos are stored in OmniClip and loaded on demand.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => setCurrentProject(project)}
                      onDelete={(event) => handleDeleteProject(project, event)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onClose={() => setConfirmConfig((current) => ({ ...current, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
      />

      <LoadingOverlay isVisible={isProcessing} message={processingMessage} />
    </>
  );
}

import React from 'react';
import { Video, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { Project } from '../db';

export function ProjectCard({
  project,
  onClick,
  onDelete,
}: {
  project: Project;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  key?: React.Key;
}) {
  return (
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
}


import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

export function LoadingOverlay({
  isVisible,
  message = 'Processing video...',
}: {
  isVisible: boolean;
  message?: string;
}) {
  return (
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
          <p className="text-zinc-400 text-sm mt-2">This may take a few moments for large files.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


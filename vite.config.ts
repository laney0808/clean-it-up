import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    esbuild: {
      target: 'esnext',
    },
    build: {
      target: 'esnext',
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'ffprobe-wasm/browser.mjs': 'ffprobe-wasm',
        '@ffmpeg/ffmpeg/dist/esm/index.js': '@ffmpeg/ffmpeg',
        '@ffmpeg/util/dist/esm/index.js': '@ffmpeg/util',
        '@floating-ui/dom/dist/floating-ui.dom.browser.mjs': '@floating-ui/dom',
        '@zip.js/zip.js/index.js': '@zip.js/zip.js',
        'web-demuxer/dist/web-demuxer.js': 'web-demuxer',
        'https://cdn.jsdelivr.net/npm/opfs-tools@0.7.0/+esm': 'opfs-tools',
        'https://cdn.jsdelivr.net/npm/mediainfo.js@0.3.2/+esm': 'mediainfo.js',
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

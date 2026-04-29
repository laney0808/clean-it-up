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
    optimizeDeps: {
      exclude: [
        '@omnimedia/omniclip',
        '@benev/slate',
        '@benev/toolbox',
        '@benev/construct',
        'lit',
        'lit/directives/repeat.js',
      ],
      esbuildOptions: {
        target: 'esnext',
      },
    },
    build: {
      target: 'esnext',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'ffprobe-wasm/browser.mjs':
          path.resolve(__dirname, 'node_modules/ffprobe-wasm/browser.mjs'),
        '@floating-ui/dom/dist/floating-ui.dom.browser.mjs':
          path.resolve(__dirname, 'node_modules/@floating-ui/dom/dist/floating-ui.dom.browser.mjs'),
        'web-demuxer/dist/web-demuxer.js':
          path.resolve(__dirname, 'node_modules/web-demuxer/dist/web-demuxer.js'),
        '@zip.js/zip.js/index.js':
          path.resolve(__dirname, 'node_modules/@zip.js/zip.js/index.js'),
        '@ffmpeg/ffmpeg/dist/esm/index.js':
          path.resolve(__dirname, 'node_modules/@ffmpeg/ffmpeg/dist/esm/index.js'),
        '@ffmpeg/util/dist/esm/index.js':
          path.resolve(__dirname, 'node_modules/@ffmpeg/util/dist/esm/index.js'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

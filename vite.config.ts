import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    build: {
      target: 'esnext',
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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
	        '@ffmpeg/ffmpeg/dist/esm/index.js': path.resolve(__dirname, 'node_modules/@ffmpeg/ffmpeg/dist/esm/index.js'),
	        '@ffmpeg/util/dist/esm/index.js': path.resolve(__dirname, 'node_modules/@ffmpeg/util/dist/esm/index.js'),
	        // @omnimedia/omniclip imports non-exported subpaths; map them to supported entrypoints.
	        'web-demuxer/dist/web-demuxer.js': 'web-demuxer',
	        '@floating-ui/dom/dist/floating-ui.dom.browser.mjs': '@floating-ui/dom',
	        '@zip.js/zip.js/index.js': '@zip.js/zip.js',
	        'fabric/dist/fabric.mjs': path.resolve(__dirname, 'node_modules/fabric/dist/fabric.mjs'),
	        'fabric/dist/index.mjs': path.resolve(__dirname, 'node_modules/fabric/dist/index.mjs'),
	        'ffprobe-wasm/browser.mjs': path.resolve(__dirname, 'node_modules/ffprobe-wasm/browser.mjs'),
	      },
	    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

import { Project, VideoAsset, Note } from './db';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { ensureOmniContext } from './omni/omniclip';

let ffmpeg: FFmpeg | null = null;

/**
 * Loads FFmpeg if not already loaded.
 */
const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;
  ffmpeg = new FFmpeg();
  // Using a CDN for the core files to avoid bundling issues
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  return ffmpeg;
};

/**
 * Converts a video buffer to MP4 if it's a MOV file.
 */
const ensureMp4 = async (buffer: ArrayBuffer, type: string, filename: string): Promise<{ buffer: ArrayBuffer, type: string }> => {
  // If it's already mp4, return as is
  if (type === 'video/mp4' || filename.toLowerCase().endsWith('.mp4')) {
    return { buffer, type: 'video/mp4' };
  }

  // If it's MOV (video/quicktime), convert it
  if (type === 'video/quicktime' || filename.toLowerCase().endsWith('.mov')) {
    console.log(`[ensureMp4] Starting conversion for: ${filename} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    try {
      console.log('[ensureMp4] Loading FFmpeg...');
      const ffmpeg = await loadFFmpeg();
      const inputName = `input_${crypto.randomUUID()}_${filename}`;
      const outputName = `output_${crypto.randomUUID()}.mp4`;

      console.log('[ensureMp4] Writing input file to FFmpeg FS...');
      await ffmpeg.writeFile(inputName, new Uint8Array(buffer));
      
      console.log('[ensureMp4] Executing FFmpeg conversion command...');
      const startTime = performance.now();
      // Convert to H.264 MP4. 
      // -preset ultrafast for speed
      // -crf 28 for reasonable quality/size balance
      // -c:a aac for audio compatibility
      await ffmpeg.exec([
        '-i', inputName, 
        '-c:v', 'libx264', 
        '-preset', 'ultrafast', 
        '-crf', '28', 
        '-c:a', 'aac', 
        '-movflags', '+faststart',
        outputName
      ]);
      const endTime = performance.now();
      console.log(`[ensureMp4] FFmpeg execution finished in ${((endTime - startTime) / 1000).toFixed(2)}s`);

      console.log('[ensureMp4] Reading output file from FFmpeg FS...');
      const data = await ffmpeg.readFile(outputName);
      
      console.log('[ensureMp4] Cleaning up FFmpeg FS...');
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      console.log('[ensureMp4] Conversion complete.');
      return {
        buffer: (data as Uint8Array).buffer,
        type: 'video/mp4'
      };
    } catch (error) {
      console.error('[ensureMp4] FFmpeg conversion failed, falling back to original:', error);
      return { buffer, type };
    }
  }

  return { buffer, type };
};

/**
 * Converts an ArrayBuffer to a Data URL using FileReader (more memory efficient).
 */
const bufferToDataUrl = (buffer: ArrayBuffer, type: string): Promise<string> => {
  console.log(`[bufferToDataUrl] Converting buffer to Data URL (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)...`);
  const startTime = performance.now();
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type });
    const reader = new FileReader();
    reader.onload = (e) => {
      const endTime = performance.now();
      console.log(`[bufferToDataUrl] Conversion complete in ${((endTime - startTime) / 1000).toFixed(2)}s`);
      resolve(e.target?.result as string);
    };
    reader.onerror = (e) => {
      console.error('[bufferToDataUrl] Conversion failed:', e);
      reject(e);
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Generates a standalone HTML file for a project.
 */
export const exportStandaloneHtml = async (
  project: Project,
  videos: VideoAsset[],
  notes: Note[],
  selectedCompVideoId: string | null,
  onProgress?: (message: string) => void
) => {
  const refVideo = videos.find(v => v.isReference);
  const compVideo = videos.find(v => v.id === selectedCompVideoId);

  const loadVideoBuffer = async (video: VideoAsset) => {
    if (video.data && video.type) {
      return { buffer: video.data, type: video.type, filename: video.name };
    }
    if (video.omniFileHash) {
      const ctx = ensureOmniContext(project.id);
      const file = await ctx.controllers.media.get_file(video.omniFileHash);
      if (file) {
        return { buffer: await file.arrayBuffer(), type: file.type || 'video/mp4', filename: file.name || video.name };
      }
    }
    throw new Error(`Video data is missing for "${video.name}".`);
  };

  // Convert MOV to MP4 if necessary
  onProgress?.('Preparing reference video...');
  if (!refVideo) throw new Error('Reference video is missing.');
  const refLoaded = await loadVideoBuffer(refVideo);
  const processedRef = await ensureMp4(refLoaded.buffer, refLoaded.type, refLoaded.filename);
  const refDataUrl = await bufferToDataUrl(processedRef.buffer, processedRef.type);

  let compDataUrl = null;
  if (compVideo) {
    onProgress?.('Preparing comparison video...');
    const compLoaded = await loadVideoBuffer(compVideo);
    const processedComp = await ensureMp4(compLoaded.buffer, compLoaded.type, compLoaded.filename);
    compDataUrl = await bufferToDataUrl(processedComp.buffer, processedComp.type);
  }

  onProgress?.('Packaging standalone viewer...');

  const notesJson = JSON.stringify(notes);
  const compOffset = compVideo?.offset || 0;
  const hasComp = !!compDataUrl;

  const htmlParts: string[] = [];

  htmlParts.push(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - VideoNote Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #000; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: white; }
        .video-container { position: relative; width: 100%; height: 100%; background: black; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        video { max-width: 100%; max-height: 100%; object-fit: contain; }
        .notes-list { height: 100%; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
        .note-item { transition: background-color 0.2s ease; }
        .note-item:hover { background-color: rgba(255,255,255,0.1) !important; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; background: #10b981; border-radius: 50%; cursor: pointer; }
        .controls-overlay { background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 40%, transparent 100%); transition: opacity 0.3s ease; }
        .hidden-ref #refWrapper { display: none; }
        .hidden-ref #compWrapper { width: 100% !important; }
        .modal-backdrop { background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px); }
        .loading-overlay { position: fixed; inset: 0; background: #000; z-index: 100; display: flex; flex-direction: column; items-center: center; justify-content: center; transition: opacity 0.5s ease; }
        .spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #10b981; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body class="h-screen flex flex-col overflow-hidden">
    <div id="loadingOverlay" class="loading-overlay">
        <div class="spinner"></div>
        <div class="text-white/60 font-medium">Loading videos...</div>
        <div id="loadingProgress" class="text-[10px] text-white/30 mt-2 uppercase tracking-widest">Processing Data Blobs</div>
    </div>
    <header class="h-14 border-b border-white/10 px-6 flex items-center justify-between bg-black shrink-0">
        <h1 class="font-bold text-white truncate">${project.name}</h1>
        <div class="text-[10px] font-bold text-white/40 uppercase tracking-widest">Standalone Viewer</div>
    </header>

    <main class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <!-- Player Area -->
        <div class="flex-1 relative group bg-black flex flex-col overflow-hidden" id="playerContainer">
            <div class="flex-1 flex" id="videoLayout">
                <div id="refWrapper" class="flex-1 border-r border-white/5 relative">
                    <div class="absolute top-2 left-2 z-10 bg-black/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white/70">Reference</div>
                    <div class="video-container">
                        <video id="refVideo" playsinline preload="auto"></video>
                    </div>
                </div>
                ${hasComp ? `
                <div id="compWrapper" class="flex-1 relative">
                    <div class="absolute top-2 left-2 z-10 bg-black/50 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white/70">Comparison</div>
                    <div class="video-container">
                        <video id="compVideo" playsinline muted preload="auto"></video>
                    </div>
                </div>` : ''}
            </div>

            <!-- Controls Overlay -->
            <div id="controlsOverlay" class="controls-overlay absolute inset-x-0 bottom-0 z-20 pt-12 pb-4 px-4 opacity-0 group-hover:opacity-100">
                <!-- Progress Bar -->
                <div class="relative h-1.5 mb-3 group/progress cursor-pointer">
                    <input type="range" id="progressBar" min="0" max="100" step="0.01" value="0" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                    <div class="absolute inset-y-0 left-0 right-0 bg-white/20 rounded-full overflow-hidden">
                        <div id="progressFill" class="h-full bg-emerald-500 transition-all duration-100 relative" style="width: 0%">
                            <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-emerald-500 rounded-full shadow-lg"></div>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <button id="playPauseBtn" class="text-white hover:text-emerald-400 transition-colors">
                            <svg id="playIcon" class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <svg id="pauseIcon" class="w-8 h-8 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        </button>
                        <div class="flex items-center gap-2 text-white/90 font-mono text-sm tabular-nums">
                            <span id="timeDisplay">00:00.00</span>
                            <span class="text-white/40">/</span>
                            <span id="durationDisplay" class="text-white/60">00:00.00</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-2">
                        <button id="toggleRefBtn" class="p-2 text-white hover:text-emerald-400 transition-colors" title="Toggle Reference Video">
                            <svg id="eyeIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <svg id="eyeOffIcon" class="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sidebar: Notes -->
        <div class="w-full lg:w-80 border-l border-white/10 bg-black flex flex-col shrink-0">
            <div class="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 class="font-bold text-white text-sm">Notes</h2>
                <span id="notesCount" class="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded text-white/60">0</span>
            </div>
            <div id="notesList" class="notes-list p-2 space-y-1">
                <!-- Notes will be injected here -->
            </div>
        </div>
    </main>

    <!-- Note Detail Modal -->
    <div id="noteModal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-6 modal-backdrop">
        <div class="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
            <div class="p-8">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-bold text-white">Note Detail</h3>
                    <div class="flex items-center gap-2 text-white/60 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span id="modalTimestamp" class="text-sm font-mono font-bold">00:00.00</span>
                    </div>
                </div>
                <div id="modalText" class="bg-white/5 border border-white/10 rounded-2xl p-6 text-white/90 whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed">
                </div>
                <div class="flex gap-3 mt-8">
                    <button id="closeModalBtn" class="flex-1 px-6 py-3 rounded-xl font-semibold text-white bg-white/10 hover:bg-white/20 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const notes = /* NOTES_START */ ${notesJson} /* NOTES_END */;
        const offset = /* OFFSET_START */ ${compOffset} /* OFFSET_END */;
        const refName = /* REF_NAME_START */ ${JSON.stringify(refVideo.name)} /* REF_NAME_END */;
        const compName = /* COMP_NAME_START */ ${compVideo ? JSON.stringify(compVideo.name) : 'null'} /* COMP_NAME_END */;
        const refDataUrl = /* REF_DATA_START */ \`${refDataUrl}\` /* REF_DATA_END */;
        const compDataUrl = /* COMP_DATA_START */ ${compDataUrl ? `\`${compDataUrl}\`` : 'null'} /* COMP_DATA_END */;

        const refVideo = document.getElementById('refVideo');
        const compVideo = document.getElementById('compVideo');
        const refSource = null;
        const compSource = null;
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playIcon = document.getElementById('playIcon');
        const pauseIcon = document.getElementById('pauseIcon');
        const timeDisplay = document.getElementById('timeDisplay');
        const durationDisplay = document.getElementById('durationDisplay');
        const progressBar = document.getElementById('progressBar');
        const progressFill = document.getElementById('progressFill');
        const notesList = document.getElementById('notesList');
        const notesCount = document.getElementById('notesCount');
        const toggleRefBtn = document.getElementById('toggleRefBtn');
        const eyeIcon = document.getElementById('eyeIcon');
        const eyeOffIcon = document.getElementById('eyeOffIcon');
        const playerContainer = document.getElementById('playerContainer');
        const noteModal = document.getElementById('noteModal');
        const modalTimestamp = document.getElementById('modalTimestamp');
        const modalText = document.getElementById('modalText');
        const closeModalBtn = document.getElementById('closeModalBtn');

        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingProgress = document.getElementById('loadingProgress');

        let isPlaying = false;
        let isRefHidden = false;

        notesCount.textContent = notes.length;

        async function loadVideo(videoElement, dataUrl, label) {
            if (!dataUrl) return;
            try {
                if (loadingProgress) loadingProgress.textContent = 'Loading ' + label + '...';
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                videoElement.src = url;
                await new Promise((resolve) => {
                    videoElement.onloadedmetadata = resolve;
                    videoElement.onerror = resolve; // Continue on error
                    videoElement.load();
                });
            } catch (e) {
                console.error("Failed to load video via Blob, falling back to Data URL:", e);
                videoElement.src = dataUrl;
                videoElement.load();
            }
        }

        async function init() {
            await Promise.all([
                loadVideo(refVideo, refDataUrl, 'Reference'),
                loadVideo(compVideo, compDataUrl, 'Comparison')
            ]);
            
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 500);
            }
        }

        init();

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 100);
            return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0') + '.' + ms.toString().padStart(2, '0');
        }

        function updateUI() {
            if (!refVideo.duration) return;
            
            const time = refVideo.currentTime;
            timeDisplay.textContent = formatTime(time);
            durationDisplay.textContent = formatTime(refVideo.duration);
            const progress = (time / refVideo.duration) * 100;
            progressBar.value = time;
            progressFill.style.width = progress + '%';

            if (compVideo) {
                const targetTime = Math.max(0, time + offset);
                if (Math.abs(compVideo.currentTime - targetTime) > 0.15) {
                    compVideo.currentTime = targetTime;
                }
            }
        }

        function togglePlay() {
            if (isPlaying) {
                refVideo.pause();
                if (compVideo) compVideo.pause();
                playIcon.classList.remove('hidden');
                pauseIcon.classList.add('hidden');
            } else {
                refVideo.play().catch(console.error);
                if (compVideo) compVideo.play().catch(console.error);
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
            }
            isPlaying = !isPlaying;
        }

        playPauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });

        playerContainer.addEventListener('click', () => {
            togglePlay();
        });

        toggleRefBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isRefHidden = !isRefHidden;
            if (isRefHidden) {
                playerContainer.classList.add('hidden-ref');
                eyeIcon.classList.add('hidden');
                eyeOffIcon.classList.remove('hidden');
            } else {
                playerContainer.classList.remove('hidden-ref');
                eyeIcon.classList.remove('hidden');
                eyeOffIcon.classList.add('hidden');
            }
        });

        refVideo.addEventListener('timeupdate', updateUI);
        refVideo.addEventListener('loadedmetadata', () => {
            progressBar.max = refVideo.duration;
            updateUI();
        });

        progressBar.addEventListener('input', (e) => {
            const time = parseFloat(e.target.value);
            refVideo.currentTime = time;
            if (compVideo) compVideo.currentTime = Math.max(0, time + offset);
            updateUI();
        });

        function showNoteDetail(note) {
            modalTimestamp.textContent = formatTime(note.timestamp);
            modalText.textContent = note.text;
            noteModal.classList.remove('hidden');
        }

        closeModalBtn.addEventListener('click', () => {
            noteModal.classList.add('hidden');
        });

        noteModal.addEventListener('click', (e) => {
            if (e.target === noteModal) noteModal.classList.add('hidden');
        });

        notes.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item group p-3 rounded-lg cursor-pointer transition-all border border-transparent';
            div.dataset.id = note.id;
            div.innerHTML = ' \
                <div class="flex items-center justify-between mb-1"> \
                    <div class="flex items-center gap-1.5 text-white/40"> \
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> \
                        <span class="text-[10px] font-mono font-bold">' + formatTime(note.timestamp) + '</span> \
                    </div> \
                    <button class="info-btn opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-white transition-all"> \
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> \
                    </button> \
                </div> \
                <p class="text-xs text-white/80 line-clamp-2">' + note.text + '</p> \
            ';
            
            div.onclick = (e) => {
                e.stopPropagation();
                refVideo.currentTime = note.timestamp;
                if (compVideo) compVideo.currentTime = Math.max(0, note.timestamp + offset);
                updateUI();
            };

            const infoBtn = div.querySelector('.info-btn');
            infoBtn.onclick = (e) => {
                e.stopPropagation();
                showNoteDetail(note);
            };

            notesList.appendChild(div);
        });
    </script>
</body>
</html>`);

  const blob = new Blob(htmlParts, { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_viewer.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

import { Project, VideoAsset, Note } from './db';

/**
 * Converts an ArrayBuffer to a Data URL using FileReader (more memory efficient).
 */
const bufferToDataUrl = (buffer: ArrayBuffer, type: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer], { type });
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
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
  selectedCompVideoId: string | null
) => {
  const refVideo = videos.find(v => v.isReference);
  const compVideo = videos.find(v => v.id === selectedCompVideoId);

  const refDataUrl = refVideo?.data ? await bufferToDataUrl(refVideo.data, refVideo.type) : null;
  const compDataUrl = compVideo?.data ? await bufferToDataUrl(compVideo.data, compVideo.type) : null;

  if (!refDataUrl) {
    throw new Error('Reference video data is missing.');
  }

  const notesJson = JSON.stringify(notes);
  const compOffset = compVideo?.offset || 0;
  const hasComp = !!compDataUrl;
  const gridClass = hasComp ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1';

  const htmlParts: string[] = [];

  // Part 1: Header and Start of Body
  htmlParts.push(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - VideoNote Viewer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #f9fafb; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        .video-container { position: relative; width: 100%; aspect-ratio: 16/9; background: black; border-radius: 1rem; overflow: hidden; }
        video { width: 100%; height: 100%; object-fit: contain; background: #000; }
        .notes-list { height: calc(100vh - 12rem); overflow-y: auto; }
        .note-item:hover { background-color: #f3f4f6; }
        .active-note { border-left: 4px solid #111827; background-color: #f3f4f6; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; background: #111827; border-radius: 50%; cursor: pointer; }
    </style>
</head>
<body class="min-h-screen flex flex-col">
    <header class="h-16 border-b border-gray-200 px-6 flex items-center justify-between bg-white sticky top-0 z-10">
        <h1 class="font-bold text-gray-900 truncate">${project.name}</h1>
        <div class="text-xs font-bold text-gray-400 uppercase tracking-widest">Standalone Viewer</div>
    </header>

    <main class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <!-- Video Area -->
        <div class="flex-1 p-6 overflow-y-auto">
            <div class="max-w-6xl mx-auto space-y-6">
                <div class="grid ${gridClass} gap-4">
                    <div class="space-y-2">
                        <div class="text-xs font-bold text-gray-400 uppercase tracking-widest">Reference</div>
                        <div class="video-container">
                            <video id="refVideo" playsinline preload="auto">
                                <source id="refSource">
                            </video>
                        </div>
                    </div>`);

  if (hasComp && compDataUrl) {
    htmlParts.push(`
                    <div class="space-y-2">
                        <div class="text-xs font-bold text-gray-400 uppercase tracking-widest">Comparison</div>
                        <div class="video-container">
                            <video id="compVideo" playsinline muted preload="auto">
                                <source id="compSource">
                            </video>
                        </div>
                    </div>`);
  }

  // Part 4: Controls and Sidebar
  htmlParts.push(`
                </div>

                <!-- Controls -->
                <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <button id="playPauseBtn" class="w-12 h-12 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition-colors">
                                <svg id="playIcon" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                <svg id="pauseIcon" class="w-6 h-6 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            </button>
                            <div class="flex flex-col">
                                <span id="timeDisplay" class="text-2xl font-mono font-bold text-gray-900 tabular-nums">00:00.00</span>
                                <span class="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Current Time</span>
                            </div>
                        </div>
                    </div>
                    <div class="relative h-2 bg-gray-100 rounded-full overflow-hidden cursor-pointer">
                        <input type="range" id="progressBar" min="0" max="100" step="0.01" value="0" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
                        <div id="progressFill" class="absolute top-0 left-0 h-full bg-gray-900" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sidebar: Notes -->
        <div class="w-full lg:w-96 border-l border-gray-200 bg-white flex flex-col">
            <div class="p-6 border-b border-gray-200">
                <h2 class="font-bold text-gray-900">Notes</h2>
            </div>
            <div id="notesList" class="notes-list p-4 space-y-3">
                <!-- Notes will be injected here -->
            </div>
        </div>
    </main>

    <script>
        const notes = ${notesJson};
        const offset = ${compOffset};
        const refDataUrl = \`${refDataUrl}\`;
        const compDataUrl = ${compDataUrl ? `\`${compDataUrl}\`` : 'null'};

        const refVideo = document.getElementById('refVideo');
        const compVideo = document.getElementById('compVideo');
        const refSource = document.getElementById('refSource');
        const compSource = document.getElementById('compSource');
        const playPauseBtn = document.getElementById('playPauseBtn');
        const playIcon = document.getElementById('playIcon');
        const pauseIcon = document.getElementById('pauseIcon');
        const timeDisplay = document.getElementById('timeDisplay');
        const progressBar = document.getElementById('progressBar');
        const progressFill = document.getElementById('progressFill');
        const notesList = document.getElementById('notesList');

        let isPlaying = false;

        // Optimized way to load large videos in Safari/Mobile
        async function loadVideo(videoElement, sourceElement, dataUrl) {
            if (!dataUrl || !sourceElement) return;
            try {
                const mime = dataUrl.split(',')[0].match(/:(.*?);/)[1];
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                
                sourceElement.type = mime;
                sourceElement.src = url;
                videoElement.load();
            } catch (e) {
                console.error("Failed to load video:", e);
                // Fallback to direct src if fetch fails
                videoElement.src = dataUrl;
            }
        }

        // Initialize videos
        Promise.all([
            loadVideo(refVideo, refSource, refDataUrl),
            loadVideo(compVideo, compSource, compDataUrl)
        ]).then(() => {
            console.log("Videos loaded via Blob URLs");
        });

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
            const progress = (time / refVideo.duration) * 100;
            progressBar.value = time;
            progressFill.style.width = progress + '%';

            // Sync comparison video
            if (compVideo) {
                const targetTime = Math.max(0, time + offset);
                if (Math.abs(compVideo.currentTime - targetTime) > 0.15) {
                    compVideo.currentTime = targetTime;
                }
            }

            // Highlight active note
            const activeNote = notes.reduce((prev, curr) => {
                if (curr.timestamp <= time + 0.1) return curr;
                return prev;
            }, null);

            document.querySelectorAll('.note-item').forEach(el => {
                el.classList.remove('active-note');
                if (activeNote && el.dataset.id === activeNote.id) {
                    el.classList.add('active-note');
                    // Optional: scroll into view if needed
                }
            });
        }

        playPauseBtn.addEventListener('click', () => {
            if (isPlaying) {
                refVideo.pause();
                if (compVideo) compVideo.pause();
                playIcon.classList.remove('hidden');
                pauseIcon.classList.add('hidden');
            } else {
                refVideo.play().catch(e => console.error("Playback failed:", e));
                if (compVideo) compVideo.play().catch(e => console.error("Comp playback failed:", e));
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
            }
            isPlaying = !isPlaying;
        });

        refVideo.addEventListener('timeupdate', updateUI);
        
        function initMetadata() {
            progressBar.max = refVideo.duration;
            // Force a small seek to ensure first frame is rendered
            if (refVideo.currentTime === 0) refVideo.currentTime = 0.01;
            if (compVideo && compVideo.currentTime === 0) compVideo.currentTime = Math.max(0.01, offset);
            updateUI();
        }

        if (refVideo.readyState >= 1) {
            initMetadata();
        } else {
            refVideo.addEventListener('loadedmetadata', initMetadata);
        }

        progressBar.addEventListener('input', (e) => {
            const time = parseFloat(e.target.value);
            refVideo.currentTime = time;
            if (compVideo) compVideo.currentTime = Math.max(0, time + offset);
            updateUI();
        });

        // Render Notes
        notes.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item p-4 border border-gray-100 rounded-xl cursor-pointer transition-all';
            div.dataset.id = note.id;
            div.innerHTML = ' \
                <div class="flex items-center gap-1.5 text-gray-500 mb-1"> \
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> \
                    <span class="text-xs font-mono font-bold">' + formatTime(note.timestamp) + '</span> \
                </div> \
                <p class="text-sm text-gray-800 whitespace-pre-wrap">' + note.text + '</p> \
            ';
            div.onclick = () => {
                refVideo.currentTime = note.timestamp;
                if (compVideo) compVideo.currentTime = Math.max(0, note.timestamp + offset);
                updateUI();
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

import JSZip from 'jszip';
import { Project, VideoAsset, Note } from './db';

/**
 * Formats seconds to M:SS.
 */
const formatTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  return `${m}:${sec}`;
};

/**
 * Generates a ZIP file containing the project videos and a launcher HTML.
 */
export const exportProjectZip = async (
  project: Project,
  videos: VideoAsset[],
  notes: Note[],
  selectedCompVideoId: string | null,
  isRefHidden: boolean,
  onProgress?: (message: string) => void
) => {
  const zip = new JSZip();
  
  const refVideo = videos.find(v => v.isReference);
  const compVideo = videos.find(v => v.id === selectedCompVideoId);

  const includeRef = !isRefHidden && !!refVideo?.data;
  const includeComp = !!compVideo?.data;

  if (!includeRef && !includeComp) {
    throw new Error('No videos to export. Please ensure at least one video is visible.');
  }

  onProgress?.('Preparing project data...');

  // Add videos to ZIP
  const exportedVideos: { id: string; name: string; offset: number; elId: string }[] = [];
  
  if (includeRef && refVideo.data) {
    onProgress?.(`Adding ${refVideo.name}...`);
    zip.file(refVideo.name, refVideo.data);
    exportedVideos.push({
      id: refVideo.id,
      name: refVideo.name,
      offset: 0,
      elId: 'v1'
    });
  }

  if (includeComp && compVideo.data) {
    onProgress?.(`Adding ${compVideo.name}...`);
    zip.file(compVideo.name, compVideo.data);
    exportedVideos.push({
      id: compVideo.id,
      name: compVideo.name,
      offset: compVideo.offset || 0,
      elId: includeRef ? 'v2' : 'v1'
    });
  }

  onProgress?.('Generating launcher...');

  // Prepare data for HTML
  const chapters = notes
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(n => ({
      label: n.text,
      time: n.timestamp
    }));

  const videoConfigs = exportedVideos.map(v => {
    // Basic extension stripping for the template
    const lastDot = v.name.lastIndexOf('.');
    const displayName = lastDot > 0 ? v.name.substring(0, lastDot) : v.name;
    return {
      name: v.name,
      displayName: displayName,
      offset: v.offset,
      elId: v.elId
    };
  });

  // HTML Template
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name} - VideoNote Viewer v1.1</title>
  <!-- Metadata for Import -->
  <!-- /* PROJECT_ID_START */ ${project.id} /* PROJECT_ID_END */ -->
  <!-- /* NOTES_START */ ${JSON.stringify(notes)} /* NOTES_END */ -->
  <!-- /* OFFSET_START */ ${compVideo?.offset || 0} /* OFFSET_END */ -->
  <!-- /* REF_NAME_START */ ${JSON.stringify(refVideo?.name || 'Reference Video')} /* REF_NAME_END */ -->
  <!-- /* COMP_NAME_START */ ${compVideo ? JSON.stringify(compVideo.name) : 'null'} /* COMP_NAME_END */ -->
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0f0f0f;
      color: #e0e0e0;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 20px 16px;
      gap: 16px;
    }

    /* ── Layout ── */
    .app-container {
      width: 100%;
      max-width: 1400px;
      display: flex;
      flex-direction: row;
      gap: 24px;
      align-items: flex-start;
    }

    @media (max-width: 1000px) {
      .app-container { flex-direction: column; }
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
    }

    .side-panel {
      width: 320px;
      max-height: 80vh;
      position: sticky;
      top: 20px;
      background: #141414;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    @media (max-width: 1000px) {
      .side-panel { width: 100%; max-height: 400px; position: static; }
    }

    /* ── Video grid ── */
    .video-row {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
    }

    .video-wrap {
      flex: 1;
      min-width: 300px;
      max-width: ${videoConfigs.length > 1 ? '680px' : '1000px'};
      display: flex;
      flex-direction: column;
      gap: 5px;
      position: relative;
    }

    .video-error-overlay {
      position: absolute;
      inset: 22px 0 0 0;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(4px);
      z-index: 10;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
      border-radius: 8px;
    }

    .video-error-overlay.visible { display: flex; }

    .video-error-overlay p {
      font-size: 0.8rem;
      color: #aaa;
      margin-bottom: 12px;
    }

    .relink-btn {
      padding: 8px 16px;
      background: #2a2a2a;
      border: 1px solid #444;
      color: #eee;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }

    .relink-btn:hover { background: #333; }

    .video-wrap label {
      font-size: 0.72rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    video {
      width: 100%;
      border-radius: 8px;
      background: #000;
    }

    /* ── Controls ── */
    .controls {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #141414;
      padding: 16px;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
    }

    .control-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .scrubber-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    input[type="range"] {
      flex: 1;
      height: 4px;
      background: #333;
      border-radius: 2px;
      appearance: none;
      cursor: pointer;
    }

    input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 12px;
      height: 12px;
      background: #4a90d9;
      border-radius: 50%;
    }

    .time-display {
      font-size: 0.75rem;
      color: #666;
      font-variant-numeric: tabular-nums;
      min-width: 80px;
    }

    #play-pause-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid #2a2a2a;
      background: #1a1a1a;
      color: #eee;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
    }

    #play-pause-btn:hover { background: #222; }

    /* ── Tab list ── */
    .side-panel-header {
      padding: 14px 18px;
      border-bottom: 1px solid #2a2a2a;
      font-size: 0.75rem;
      font-weight: 700;
      color: #444;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .tab-list {
      flex: 1;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #333 transparent;
    }

    .tab-list::-webkit-scrollbar { width: 6px; }
    .tab-list::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }

    .tab {
      display: grid;
      grid-template-columns: 56px 1fr;
      align-items: start;
      gap: 0;
      border-bottom: 1px solid #1e1e1e;
      cursor: pointer;
      transition: background 0.12s;
      background: #141414;
    }

    .tab:last-child { border-bottom: none; }
    .tab:hover { background: #1c1c1c; }
    .tab.active { background: #152030; }

    .tab-time {
      padding: 12px 0 12px 14px;
      font-size: 0.72rem;
      color: #555;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      line-height: 1.4;
      padding-top: 13px;
    }

    .tab.active .tab-time { color: #4a90d9; }

    .tab-body {
      padding: 12px 14px 12px 8px;
    }

    .tab-label {
      font-size: 0.85rem;
      line-height: 1.4;
      color: #ccc;
      /* collapsed: single line with ellipsis */
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
      transition: all 0.15s;
    }

    .tab.active .tab-label { color: #e8e8e8; }

    /* expanded state — remove clamp */
    .tab.expanded .tab-label {
      -webkit-line-clamp: unset;
      overflow: visible;
      display: block;
    }

    .expand-hint {
      font-size: 0.68rem;
      color: #444;
      margin-top: 3px;
    }

    .tab.expanded .expand-hint { display: none; }
  </style>
</head>
<body>

  <div class="app-container">
    <div class="main-content">
      <div class="video-row">
        ${videoConfigs.map((v, i) => `
        <div class="video-wrap">
          <label>${v.displayName} ${v.offset !== 0 ? `(Offset: ${v.offset > 0 ? '+' : ''}${v.offset}s)` : ''}</label>
          <video id="${v.elId}" src="${v.name}"></video>
          <div id="overlay-${v.elId}" class="video-error-overlay">
            <p>Video source unavailable: ${v.name}</p>
            <input type="file" id="input-${v.elId}" accept="video/*" style="display:none">
            <button class="relink-btn" onclick="document.getElementById('input-${v.elId}').click()">Link Video File</button>
          </div>
        </div>
        `).join('')}
      </div>

      <div class="controls">
        <div class="control-row">
          <div class="scrubber-wrap">
            <span class="time-display" id="current-time">0:00</span>
            <input type="range" id="scrubber" min="0" value="0" step="0.01">
            <span class="time-display" id="total-time">0:00</span>
          </div>
        </div>
        <div class="control-row">
          <button id="play-pause-btn" title="Play/Pause">▶</button>
        </div>
      </div>
    </div>

    <div class="side-panel">
      <div class="side-panel-header">Notes & Timestamps</div>
      <div class="tab-list" id="tab-list"></div>
    </div>
  </div>

  <script>
    const chapters = ${JSON.stringify(chapters)};

    const videos = [
      ${videoConfigs.map(v => `{ el: document.getElementById("${v.elId}"), offset: ${v.offset}, name: "${v.name}" }`).join(',\n      ')}
    ];

    const playPauseBtn = document.getElementById("play-pause-btn");
    const scrubber = document.getElementById("scrubber");
    const currentTimeEl = document.getElementById("current-time");
    const totalTimeEl = document.getElementById("total-time");
    const listEl   = document.getElementById("tab-list");

    let isPlaying = false;
    let duration = 0;
    let initialized = false;

    // ── Video error handling & Re-linking ────────────────────
    videos.forEach(({ el, name }) => {
      if (!el) return;
      const overlay = document.getElementById("overlay-" + el.id);
      const input = document.getElementById("input-" + el.id);

      const showPrompt = () => overlay.classList.add("visible");
      const hidePrompt = () => overlay.classList.remove("visible");

      el.onerror = showPrompt;

      // Watchdog: If video stays in NOTHING state for 3s, prompt for link
      setTimeout(() => {
        if (el.readyState === 0) {
           showPrompt();
        }
      }, 3000);

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        el.src = url;
        hidePrompt();
        el.load(); // Ensure new source is initialized
      };

      el.addEventListener('loadedmetadata', updateDuration);
      el.addEventListener('canplay', () => {
        if (!initialized) {
          updateDuration();
          jumpTo(0);
          initialized = true;
        }
      });
    });

    function updateDuration() {
      const maxDur = videos.reduce((acc, { el, offset }) => {
        if (!el || isNaN(el.duration)) return acc;
        return Math.max(acc, el.duration - offset);
      }, 0);
      if (maxDur > 0) {
        duration = maxDur;
        scrubber.max = maxDur;
        totalTimeEl.textContent = formatTime(maxDur);
      }
    }

    // ── Play/Pause ───────────────────────────────────────────
    playPauseBtn.addEventListener("click", togglePlay);

    function togglePlay() {
      isPlaying = !isPlaying;
      playPauseBtn.textContent = isPlaying ? "⏸" : "▶";

      if (!isPlaying) {
        // Strict sync on PAUSE
        const master = videos.find(v => v.offset === 0) || videos[0];
        if (master && master.el) {
          const base = master.el.currentTime - master.offset;
          jumpTo(base);
        }
      }

      videos.forEach(({ el }) => {
        if (!el) return;
        if (isPlaying) el.play().catch(() => {});
        else el.pause();
      });
    }

    // ── Scrubber ─────────────────────────────────────────────
    scrubber.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      jumpTo(val);
    });

    // ── Jump to timestamp (pause + seek) ──────────────────────
    function jumpTo(timestamp) {
      videos.forEach(({ el, offset }) => {
        if (!el) return;
        el.currentTime = Math.max(0, timestamp + offset);
      });
      currentTimeEl.textContent = formatTime(timestamp);
    }

    // ── Update active notes & scrubber ────────────────────────
    videos.forEach(({ el }) => {
      if (!el) return;
      el.addEventListener("timeupdate", () => {
        if (el === (videos.find(v => v.offset === 0) || videos[0]).el) {
          const base = el.currentTime - (videos.find(v => v.el === el)?.offset || 0);
          scrubber.value = base;
          currentTimeEl.textContent = formatTime(base);
          
          // Update active notes
          let active = -1;
          for (let i = 0; i < chapters.length; i++) {
            if (base >= chapters[i].time) active = i;
          }
          setActive(active);
        }
      });
    });

    // ── Keyboard Controls ─────────────────────────────────────
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const base = videos[0].el.currentTime - videos[0].offset;
        jumpTo(Math.max(0, base - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const base = videos[0].el.currentTime - videos[0].offset;
        jumpTo(Math.min(duration, base + 5));
      }
    });

    // ── Build tab list ────────────────────────────────────────
    const tabEls = [];

    chapters.forEach((ch, i) => {
      const div = document.createElement("div");
      div.className = "tab";
      const isLong = ch.label.length > 60;

      // Use concatenation to avoid nesting template literals in the exporter
      let html = '<div class="tab-time">' + formatTime(ch.time) + '</div>';
      html += '<div class="tab-body">';
      html += '<div class="tab-label">' + ch.label + '</div>';
      if (isLong) html += '<div class="expand-hint">▸ click to expand</div>';
      html += '</div>';
      
      div.innerHTML = html;

      div.addEventListener("click", () => {
        if (div.classList.contains("active")) {
          div.classList.toggle("expanded");
        } else {
          tabEls.forEach(t => t.classList.remove("expanded"));
          jumpTo(ch.time);
          setActive(i);
        }
      });

      listEl.appendChild(div);
      tabEls.push(div);
    });

    function setActive(index) {
      tabEls.forEach((el, i) => el.classList.toggle("active", i === index));
    }

    function formatTime(s) {
      if (isNaN(s)) return "0:00";
      const m   = Math.floor(s / 60);
      const sec = String(Math.floor(s % 60)).padStart(2, "0");
      return m + ":" + sec;
    }
  </script>

</body>
</html>`;

  zip.file('launcher.html', htmlContent);

  onProgress?.('Generating ZIP file...');
  const content = await zip.generateAsync({ type: 'blob' });
  
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_export.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Exports project metadata as a JSON file.
 */
export const exportProjectJson = (
  project: Project,
  videos: VideoAsset[],
  notes: Note[]
) => {
  const exportData = {
    version: '1.0',
    project: {
      name: project.name,
      id: project.id
    },
    videos: videos.map(v => ({
      name: v.name,
      isReference: v.isReference,
      offset: v.offset || 0,
      id: v.id
    })),
    notes: notes.map(n => ({
      text: n.text,
      timestamp: n.timestamp
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_project.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Exports notes as a pure text file with timestamps adjusted by a video's offset.
 */
export const exportProjectText = (
  project: Project,
  notes: Note[],
  selectedVideo: VideoAsset
) => {
  const content = notes
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(note => {
      // Adjusted timestamp = note.timestamp + video.offset
      const adjustedSeconds = Math.floor(note.timestamp + (selectedVideo.offset || 0));
      const mm = Math.floor(adjustedSeconds / 60).toString().padStart(2, '0');
      const ss = (adjustedSeconds % 60).toString().padStart(2, '0');
      return `${mm}:${ss} ${note.text}`;
    })
    .join('\n');

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, '_')}_notes.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

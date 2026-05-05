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

  const videoConfigs = exportedVideos.map(v => ({
    name: v.name,
    offset: v.offset,
    elId: v.elId
  }));

  // HTML Template
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.name} - Viewer</title>
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

    /* ── Video grid ── */
    .video-row {
      width: 100%;
      max-width: 1100px;
      display: grid;
      grid-template-columns: ${videoConfigs.length > 1 ? '1fr 1fr' : '1fr'};
      gap: 12px;
    }

    @media (max-width: 600px) {
      .video-row { grid-template-columns: 1fr; }
    }

    .video-wrap {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

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
      max-width: 1100px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    #sync-btn {
      padding: 7px 18px;
      border-radius: 8px;
      border: 1px solid #4a90d9;
      background: #1a3a5c;
      color: #a8d4ff;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }

    #sync-btn:hover { background: #1f4a75; }

    #sync-status {
      font-size: 0.75rem;
      padding: 4px 12px;
      border-radius: 99px;
      background: #1a3a1a;
      border: 1px solid #2e6b2e;
      color: #6fcf6f;
      white-space: nowrap;
    }

    #sync-status.stale {
      background: #3a2a1a;
      border-color: #8a5a1a;
      color: #f0a050;
    }

    /* ── Tab list ── */
    .tab-list-wrap {
      width: 100%;
      max-width: 1100px;
      display: flex;
      flex-direction: column;
      gap: 0;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      overflow: hidden;
    }

    .tab-list {
      max-height: 340px;
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

  <div class="video-row">
    ${videoConfigs.map((v, i) => `
    <div class="video-wrap">
      <label>${v.name} — offset: ${v.offset > 0 ? '+' : ''}${v.offset}s</label>
      <video id="${v.elId}" src="${v.name}" controls></video>
    </div>
    `).join('')}
  </div>

  <div class="controls">
    <button id="sync-btn">⏸ Sync</button>
    <div id="sync-status">● Synced</div>
  </div>

  <div class="tab-list-wrap">
    <div class="tab-list" id="tab-list"></div>
  </div>

  <script>
    const chapters = ${JSON.stringify(chapters)};

    const videos = [
      ${videoConfigs.map(v => `{ el: document.getElementById("${v.elId}"), offset: ${v.offset} }`).join(',\n      ')}
    ];

    const statusEl = document.getElementById("sync-status");
    const syncBtn  = document.getElementById("sync-btn");
    const listEl   = document.getElementById("tab-list");

    // ── Jump to timestamp (pause + seek) ──────────────────────
    function jumpTo(timestamp) {
      videos.forEach(({ el, offset }) => {
        if (!el) return;
        el.pause();
        el.currentTime = Math.max(0, timestamp + offset);
      });
      setSynced(true);
    }

    // ── Sync button ───────────────────────────────────────────
    syncBtn.addEventListener("click", () => {
      const baseTimes = videos.map(({ el, offset }) => el ? el.currentTime - offset : 0);
      const earliest  = Math.min(...baseTimes);
      videos.forEach(({ el, offset }) => {
        if (!el) return;
        el.pause();
        el.currentTime = Math.max(0, earliest + offset);
      });
      setSynced(true);
    });

    // ── Stale detection ───────────────────────────────────────
    videos.forEach(({ el }) => {
      if (!el) return;
      el.addEventListener("seeking", () => setSynced(false));
    });

    function setSynced(synced) {
      statusEl.textContent = synced ? "● Synced" : "● Out of sync";
      statusEl.className   = synced ? "" : "stale";
    }

    // ── Keyboard Controls ─────────────────────────────────────
    window.addEventListener("keydown", (e) => {
      // Don't trigger if user is typing (though launcher has no inputs currently)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === "Space") {
        e.preventDefault();
        const isPaused = videos[0].el.paused;
        videos.forEach(({ el }) => {
          if (!el) return;
          if (isPaused) el.play().catch(() => {});
          else el.pause();
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const currentTime = videos[0].el.currentTime - videos[0].offset;
        jumpTo(Math.max(0, currentTime - 1/30));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const currentTime = videos[0].el.currentTime - videos[0].offset;
        const duration = videos[0].el.duration;
        jumpTo(Math.min(duration, currentTime + 1/30));
      }
    });

    // ── Build tab list ────────────────────────────────────────
    const tabEls = [];

    chapters.forEach((ch, i) => {
      const div = document.createElement("div");
      div.className = "tab";

      // Check if text is likely to overflow (heuristic: > 60 chars)
      const isLong = ch.label.length > 60;

      div.innerHTML = \`
        <div class="tab-time">\${formatTime(ch.time)}</div>
        <div class="tab-body">
          <div class="tab-label">\${ch.label}</div>
          \${isLong ? '<div class="expand-hint">▸ click to expand</div>' : ''}
        </div>
      \`;

      div.addEventListener("click", (e) => {
        // If already active, toggle expanded
        if (div.classList.contains("active")) {
          div.classList.toggle("expanded");
        } else {
          // Collapse any previously expanded tab
          tabEls.forEach(t => t.classList.remove("expanded"));
          jumpTo(ch.time);
          setActive(i);
        }
      });

      listEl.appendChild(div);
      tabEls.push(div);
    });

    // ── Active tab tracking ───────────────────────────────────
    if (videos.length > 0 && videos[0].el) {
      videos[0].el.addEventListener("timeupdate", () => {
        const base = videos[0].el.currentTime - videos[0].offset;
        let active = 0;
        for (let i = 0; i < chapters.length; i++) {
          if (base >= chapters[i].time) active = i;
        }
        setActive(active);
      });
    }

    function setActive(index) {
      tabEls.forEach((el, i) => el.classList.toggle("active", i === index));
    }

    function formatTime(s) {
      const m   = Math.floor(s / 60);
      const sec = String(Math.floor(s % 60)).padStart(2, "0");
      return \`\${m}:\${sec}\`;
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

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { Note, Project, ProjectVideo } from './db';
import { getOmniVideoFile } from './omniDb';

let ffmpeg: FFmpeg | null = null;

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
};

const ensureMp4 = async (file: File): Promise<{ buffer: ArrayBuffer; type: string }> => {
  const buffer = await file.arrayBuffer();

  if (file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')) {
    return { buffer, type: 'video/mp4' };
  }

  if (file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov')) {
    try {
      const ffmpeg = await loadFFmpeg();
      const inputName = `input_${crypto.randomUUID()}_${file.name}`;
      const outputName = `output_${crypto.randomUUID()}.mp4`;

      await ffmpeg.writeFile(inputName, new Uint8Array(buffer));
      await ffmpeg.exec([
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputName,
      ]);

      const data = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      return {
        buffer: (data as Uint8Array).buffer,
        type: 'video/mp4',
      };
    } catch (error) {
      console.error('[exportStandaloneHtml] Failed to convert MOV, using original file:', error);
    }
  }

  return { buffer, type: file.type || 'video/mp4' };
};

const bufferToDataUrl = (buffer: ArrayBuffer, type: string) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = (event) => reject(event);
    reader.readAsDataURL(new Blob([buffer], { type }));
  });

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const exportStandaloneHtml = async (
  project: Project,
  videos: ProjectVideo[],
  notes: Note[],
  selectedCompVideoId: string | null,
  onProgress?: (message: string) => void,
) => {
  const referenceVideo = videos.find((video) => video.role === 'reference');
  const comparisonVideo = videos.find((video) => video.id === selectedCompVideoId);

  if (!referenceVideo) {
    throw new Error('Reference video is missing.');
  }

  const referenceFile = await getOmniVideoFile(referenceVideo.omniFileKey);
  if (!referenceFile) {
    throw new Error('Reference video file is missing from OmniClip storage.');
  }

  onProgress?.('Preparing reference video...');
  const processedReference = await ensureMp4(referenceFile);
  const referenceDataUrl = await bufferToDataUrl(processedReference.buffer, processedReference.type);

  let comparisonDataUrl: string | null = null;
  if (comparisonVideo) {
    const comparisonFile = await getOmniVideoFile(comparisonVideo.omniFileKey);
    if (comparisonFile) {
      onProgress?.('Preparing comparison video...');
      const processedComparison = await ensureMp4(comparisonFile);
      comparisonDataUrl = await bufferToDataUrl(processedComparison.buffer, processedComparison.type);
    }
  }

  onProgress?.('Packaging standalone viewer...');

  const safeTitle = escapeHtml(project.title);
  const notesJson = JSON.stringify(notes);
  const comparisonStartAt = comparisonVideo?.startAt ?? 0;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - VideoNote Viewer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #000; color: white; font-family: ui-sans-serif, system-ui, sans-serif; }
    .video-shell { background: #050505; display: flex; align-items: center; justify-content: center; }
    video { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body class="h-screen flex flex-col overflow-hidden">
  <header class="h-14 px-6 border-b border-white/10 flex items-center justify-between bg-black shrink-0">
    <h1 class="font-bold truncate">${safeTitle}</h1>
    <span class="text-[10px] uppercase tracking-[0.2em] text-white/40">Standalone Viewer</span>
  </header>

  <main class="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
    <section class="bg-black p-4 flex flex-col gap-4 min-h-0">
      <div class="grid flex-1 min-h-0 ${comparisonDataUrl ? 'grid-cols-2' : 'grid-cols-1'} gap-4">
        <div class="video-shell rounded-2xl overflow-hidden relative">
          <span class="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Reference</span>
          <video id="refVideo" controls playsinline preload="auto"></video>
        </div>
        ${
          comparisonDataUrl
            ? `<div class="video-shell rounded-2xl overflow-hidden relative">
          <span class="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Comparison</span>
          <video id="compVideo" controls playsinline preload="auto" muted></video>
        </div>`
            : ''
        }
      </div>
    </section>

    <aside class="border-l border-white/10 bg-black/95 p-4 overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-semibold">Notes</h2>
        <span class="text-xs text-white/50">${notes.length}</span>
      </div>
      <div id="notesList" class="space-y-2"></div>
    </aside>
  </main>

  <script>
    const notes = /* NOTES_START */ ${notesJson} /* NOTES_END */;
    const comparisonStartAt = /* START_AT_START */ ${comparisonStartAt} /* START_AT_END */;
    const referenceDataUrl = /* REF_DATA_START */ \`${referenceDataUrl}\` /* REF_DATA_END */;
    const comparisonDataUrl = /* COMP_DATA_START */ ${
      comparisonDataUrl ? `\`${comparisonDataUrl}\`` : 'null'
    } /* COMP_DATA_END */;
    const referenceName = /* REF_NAME_START */ ${JSON.stringify(referenceVideo.displayName)} /* REF_NAME_END */;
    const comparisonName = /* COMP_NAME_START */ ${
      comparisonVideo ? JSON.stringify(comparisonVideo.displayName) : 'null'
    } /* COMP_NAME_END */;

    const refVideo = document.getElementById('refVideo');
    const compVideo = document.getElementById('compVideo');
    const notesList = document.getElementById('notesList');

    refVideo.src = referenceDataUrl;
    if (compVideo && comparisonDataUrl) {
      compVideo.src = comparisonDataUrl;
    }

    const formatTimestamp = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      const hundredths = Math.floor((seconds % 1) * 100);
      return \`\${String(mins).padStart(2, '0')}:\${String(secs).padStart(2, '0')}.\${String(hundredths).padStart(2, '0')}\`;
    };

    notes.forEach((note) => {
      const button = document.createElement('button');
      button.className = 'w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-3';
      button.innerHTML = \`
        <div class="text-xs text-emerald-300 font-mono mb-1">\${formatTimestamp(note.timestamp)}</div>
        <div class="text-sm text-white/80 whitespace-pre-wrap">\${note.text}</div>
      \`;
      button.addEventListener('click', () => {
        refVideo.currentTime = note.timestamp;
        if (compVideo && comparisonDataUrl) {
          compVideo.currentTime = Math.max(0, note.timestamp - comparisonStartAt);
        }
      });
      notesList.appendChild(button);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.title.replace(/\s+/g, '_')}_viewer.html`;
  anchor.click();
  URL.revokeObjectURL(url);
};

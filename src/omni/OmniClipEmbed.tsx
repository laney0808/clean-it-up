import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { OmniContext } from '@omnimedia/omniclip/x/context/context.js';
import type { VideoFile } from '@omnimedia/omniclip/x/components/omni-media/types.js';
import { ensureOmniContext } from './omniclip';
import type { VideoAsset } from '../db';

export type OmniClipHandle = {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekSeconds: (seconds: number) => void;
  getTimeSeconds: () => number;
  getDurationSeconds: () => number;
  clearTimeline: () => void;
};

function computeTimelineDurationMs(context: OmniContext) {
  const effects = context.state.effects ?? [];
  if (effects.length === 0) return 0;
  return Math.max(
    0,
    ...effects.map((e) => e.start_at_position + (e.end - e.start)),
  );
}

async function getVideoFileByHash(context: OmniContext, hash: string): Promise<VideoFile | null> {
  await context.controllers.media.are_files_ready();
  const imported = await context.controllers.media.getImportedFiles();
  const match = imported.find((f) => f.kind === 'video' && f.hash === hash);
  return (match as VideoFile | undefined) ?? null;
}

async function addVideoHashToTimeline(context: OmniContext, hash: string) {
  const videoFile = await getVideoFileByHash(context, hash);
  if (!videoFile) return;

  const [video] = await context.controllers.media.create_video_elements([videoFile]);
  if (!video) return;

  context.controllers.compositor.managers.videoManager.create_and_add_video_effect(video, context.state);
  context.controllers.compositor.compose_effects(context.state.effects, context.state.timecode);
}

function removeVideoHashFromTimeline(context: OmniContext, hash: string) {
  const toRemove = context.state.effects.filter((e) => e.kind === 'video' && (e as any).file_hash === hash);
  for (const effect of toRemove) {
    context.controllers.timeline.set_selected_effect(effect as any, context.state);
    context.controllers.timeline.remove_selected_effect(context.state);
  }
  context.controllers.compositor.compose_effects(context.state.effects, context.state.timecode);
}

export const OmniClipEmbed = forwardRef(function OmniClipEmbed(
  props: {
    projectId: string;
    videos: VideoAsset[];
    selectedVideoIds: string[];
    onTimeSecondsChange?: (seconds: number) => void;
    onDurationSecondsChange?: (seconds: number) => void;
    onPlayingChange?: (playing: boolean) => void;
  },
  ref: React.ForwardedRef<OmniClipHandle>,
) {
  const { projectId, videos, selectedVideoIds, onTimeSecondsChange, onDurationSecondsChange, onPlayingChange } = props;

  const contextRef = useRef<OmniContext | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);

  const selectedHashes = useMemo(() => {
    const idSet = new Set(selectedVideoIds);
    return videos
      .filter((v) => idSet.has(v.id))
      .map((v) => v.omniFileHash)
      .filter((h): h is string => !!h);
  }, [selectedVideoIds, videos]);

  useEffect(() => {
    const ctx = ensureOmniContext(projectId);
    contextRef.current = ctx;

    const host = canvasHostRef.current;
    if (host) {
      const view = ctx.controllers.compositor.app.view;
      if (view.parentElement !== host) {
        view.remove();
        host.appendChild(view);
      }
    }

    setIsReady(true);
  }, [projectId]);

  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx || !isReady) return;

    const desired = new Set(selectedHashes);
    const existing = new Set(
      ctx.state.effects
        .filter((e) => e.kind === 'video')
        .map((e) => (e as any).file_hash as string),
    );

    for (const hash of existing) {
      if (!desired.has(hash)) removeVideoHashFromTimeline(ctx, hash);
    }

    (async () => {
      for (const hash of desired) {
        if (!existing.has(hash)) {
          await addVideoHashToTimeline(ctx, hash);
        }
      }
    })();
  }, [selectedHashes, isReady]);

  useEffect(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    let raf = 0;
    let lastTimecode = -1;
    let lastPlaying = ctx.state.is_playing;
    let lastDuration = -1;

    const tick = () => {
      const timecode = ctx.state.timecode;
      if (timecode !== lastTimecode) {
        lastTimecode = timecode;
        const seconds = timecode / 1000;
        setTimeSeconds(seconds);
        onTimeSecondsChange?.(seconds);
      }

      const playing = ctx.state.is_playing;
      if (playing !== lastPlaying) {
        lastPlaying = playing;
        setPlaying(playing);
        onPlayingChange?.(playing);
      }

      const durationMs = computeTimelineDurationMs(ctx);
      if (durationMs !== lastDuration) {
        lastDuration = durationMs;
        const seconds = durationMs / 1000;
        setDurationSeconds(seconds);
        onDurationSecondsChange?.(seconds);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onTimeSecondsChange, onDurationSecondsChange, onPlayingChange]);

  const [scrubIsDragging, setScrubIsDragging] = useState(false);

  const seekToFraction = (fraction: number) => {
    const ctx = contextRef.current;
    if (!ctx) return;

    const durationMs = Math.max(0, computeTimelineDurationMs(ctx));
    const ms = durationMs === 0 ? 0 : Math.max(0, Math.min(durationMs, fraction * durationMs));
    ctx.actions.set_is_playing(false, { omit: true });
    ctx.actions.set_timecode(ms, { omit: true });
    ctx.controllers.compositor.compose_effects(ctx.state.effects, ms);
    void ctx.controllers.compositor.seek(ms, true).then(() => ctx.controllers.compositor.compose_effects(ctx.state.effects, ms));
  };

  useImperativeHandle(ref, () => ({
    play: () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.controllers.compositor.set_video_playing(true);
    },
    pause: () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.controllers.compositor.set_video_playing(false);
    },
    togglePlay: () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.controllers.compositor.toggle_video_playing();
    },
    seekSeconds: (seconds: number) => {
      const ctx = contextRef.current;
      if (!ctx) return;
      const durationMs = Math.max(0, computeTimelineDurationMs(ctx));
      const ms = Math.max(0, Math.min(durationMs || seconds * 1000, seconds * 1000));
      ctx.actions.set_is_playing(false, { omit: true });
      ctx.actions.set_timecode(ms, { omit: true });
      ctx.controllers.compositor.compose_effects(ctx.state.effects, ms);
      void ctx.controllers.compositor.seek(ms, true).then(() => ctx.controllers.compositor.compose_effects(ctx.state.effects, ms));
    },
    getTimeSeconds: () => (contextRef.current?.state.timecode ?? 0) / 1000,
    getDurationSeconds: () => {
      const ctx = contextRef.current;
      return ctx ? computeTimelineDurationMs(ctx) / 1000 : 0;
    },
    clearTimeline: () => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.clear_project(true);
      ctx.controllers.compositor.compose_effects(ctx.state.effects, ctx.state.timecode);
    },
  }));

  const progress = durationSeconds > 0 ? Math.min(1, Math.max(0, timeSeconds / durationSeconds)) : 0;

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <div className="relative rounded-xl overflow-hidden bg-black border border-white/10">
        <div ref={canvasHostRef} className="w-full aspect-video bg-black flex items-center justify-center" />

        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <div
            className="relative h-2 rounded-full bg-white/20 cursor-pointer select-none"
            onPointerDown={(e) => {
              const target = e.currentTarget;
              target.setPointerCapture(e.pointerId);
              setScrubIsDragging(true);
              const rect = target.getBoundingClientRect();
              seekToFraction((e.clientX - rect.left) / rect.width);
            }}
            onPointerMove={(e) => {
              if (!scrubIsDragging) return;
              const rect = e.currentTarget.getBoundingClientRect();
              seekToFraction((e.clientX - rect.left) / rect.width);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setScrubIsDragging(false);
            }}
            onPointerCancel={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setScrubIsDragging(false);
            }}
          >
            <div className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full" style={{ width: `${progress * 100}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-500 rounded-full shadow-lg"
              style={{ left: `calc(${progress * 100}% - 8px)` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-white/80 text-xs">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white font-semibold"
              onClick={() => contextRef.current?.controllers.compositor.toggle_video_playing()}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <div className="font-mono tabular-nums">
              {timeSeconds.toFixed(2)}s / {durationSeconds.toFixed(2)}s
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-zinc-200 bg-white min-h-[240px]">
        <omni-timeline style={{ display: 'block' }} />
      </div>
    </div>
  );
});

import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { VideoAsset } from '../db';
import { cn } from '../utils';

export function VideoSyncPlayer({
  refVideo,
  compVideo,
  refBlob,
  compBlob,
  currentTime,
  isPlaying,
  isRefMuted,
  isCompMuted,
  isRefHidden,
  onToggleRefMute,
  onToggleCompMute,
  onTimeUpdate,
  onDurationChange,
}: {
  refVideo: VideoAsset;
  compVideo?: VideoAsset;
  refBlob?: Blob;
  compBlob?: Blob;
  currentTime: number;
  isPlaying: boolean;
  isRefMuted: boolean;
  isCompMuted: boolean;
  isRefHidden: boolean;
  onToggleRefMute: () => void;
  onToggleCompMute: () => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}) {
  const refVideoRef = useRef<HTMLVideoElement>(null);
  const compVideoRef = useRef<HTMLVideoElement>(null);
  const [refUrl, setRefUrl] = useState<string | undefined>(undefined);
  const [compUrl, setCompUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!refBlob) return;
    const url = URL.createObjectURL(refBlob);
    setRefUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setRefUrl(undefined);
    };
  }, [refBlob, refVideo.id]);

  useEffect(() => {
    if (compBlob) {
      const url = URL.createObjectURL(compBlob);
      setCompUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setCompUrl(undefined);
      };
    } else {
      setCompUrl(undefined);
    }
  }, [compBlob, compVideo?.id]);

  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    if (isPlaying) {
      ref.play().catch(() => {});
      comp?.play().catch(() => {});
    } else {
      ref.pause();
      comp?.pause();
    }
  }, [isPlaying, refUrl, compUrl]);

  useEffect(() => {
    const ref = refVideoRef.current;
    const comp = compVideoRef.current;
    if (!ref) return;

    if (Math.abs(ref.currentTime - currentTime) > 0.3) {
      ref.currentTime = currentTime;
    }

    if (comp && compVideo) {
      const compTime = currentTime + compVideo.offset;
      if (Math.abs(comp.currentTime - compTime) > 0.3) {
        comp.currentTime = Math.max(0, compTime);
      }
    }
  }, [currentTime, compVideo?.offset]);

  const handleRefTimeUpdate = () => {
    if (refVideoRef.current) {
      onTimeUpdate(refVideoRef.current.currentTime);
    }
  };

  return (
    <div className={cn('grid gap-0', compVideo && !isRefHidden ? 'grid-cols-2' : 'grid-cols-1')}>
      {!isRefHidden && (
        <div className="relative aspect-video bg-black overflow-hidden shadow-inner">
          {refUrl && (
            <video
              ref={refVideoRef}
              src={refUrl}
              className="w-full h-full object-contain"
              onTimeUpdate={handleRefTimeUpdate}
              onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
              playsInline
              muted={isRefMuted}
              preload="auto"
            />
          )}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
            Reference
          </div>
          <button
            onClick={onToggleRefMute}
            className={cn(
              'absolute top-4 right-4 p-2 rounded-lg backdrop-blur-sm transition-colors',
              isRefMuted ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
            )}
          >
            {isRefMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      )}

      {isRefHidden && refUrl && (
        <video
          ref={refVideoRef}
          src={refUrl}
          className="hidden"
          onTimeUpdate={handleRefTimeUpdate}
          onLoadedMetadata={(e) => onDurationChange(e.currentTarget.duration)}
          playsInline
          muted={isRefMuted}
          preload="auto"
        />
      )}

      {compVideo && (
        <div className="relative aspect-video bg-black overflow-hidden shadow-inner">
          {compUrl && (
            <video
              ref={compVideoRef}
              src={compUrl}
              className="w-full h-full object-contain"
              playsInline
              muted={isCompMuted}
              preload="auto"
            />
          )}
          <div className="absolute top-4 left-4 px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded uppercase tracking-widest font-bold">
            Comparison
          </div>
          <button
            onClick={onToggleCompMute}
            className={cn(
              'absolute top-4 right-4 p-2 rounded-lg backdrop-blur-sm transition-colors',
              isCompMuted ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white hover:bg-black/70'
            )}
          >
            {isCompMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {currentTime + compVideo.offset < 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-medium">
              Waiting for offset...
            </div>
          )}
        </div>
      )}
    </div>
  );
}


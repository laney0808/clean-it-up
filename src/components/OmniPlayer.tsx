import React, {
  useRef, useEffect, useState,
  useImperativeHandle, forwardRef
} from 'react'
import { Datafile } from '@omnimedia/omnitool'
import { useOmni } from '../omni/OmniContext'
import type { ClipEntry } from '../types/clip';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OmniPlayerHandle {
  seek: (ms: number) => Promise<void>
  setOffset: (clipId: number, startTime: number) => Promise<void>
}

interface Props {
  isEditing: boolean
  clips: ClipEntry[]
  clipsConfirmed: boolean
  onClipsRebuildDone: () => void
  onTimeUpdate: (ms: number) => void
}

// ─── Per-clip state (mute, mirror) ───────────────────────────────────────────

interface ClipControls {
  [clipId: number]: {
    muted: boolean
    mirrored: boolean
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const OmniPlayer = forwardRef<OmniPlayerHandle, Props>(({
  isEditing,
  clips,
  clipsConfirmed,
  onClipsRebuildDone,
  onTimeUpdate,
}, ref) => {
  const omni = useOmni()
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const clipsRef = useRef<ClipEntry[]>(clips)  // keep ref in sync for imperative methods
  const lastTimeUpdateRef = useRef<number>(0)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [clipControls, setClipControls] = useState<ClipControls>({})
  const [isBuilding, setIsBuilding] = useState(false)
  const [oneframe, setOneframe] = useState(1000/60)

  // keep clipsRef in sync
  useEffect(() => { clipsRef.current = clips }, [clips])

  // ─── Build / rebuild timeline ───────────────────────────────────────────────

  async function buildTimeline(targetClips: ClipEntry[], controls: ClipControls) {
    if (targetClips.length === 0) return
    setIsBuilding(true)

    const resumeTime = playerRef.current?.currentTime ?? 0

    //todo: dynamically calculate this
    const canvasWidth = 1280
    const canvasHeight = 720
    const count = targetClips.length
    const sliceWidth = canvasWidth / count

    const tl = omni.timeline(o => {
      const items = targetClips.map((c, i) => {
        const ctrl = controls[c.id] ?? { muted: false, mirrored: false }
        const scaleX = (1 / count) * (ctrl.mirrored ? -1 : 1)
        const scaleY = 1 / count

        const spatial = o.spatial(o.transform({
          position: [sliceWidth * i + sliceWidth / 2, canvasHeight / 2],
          scale: [scaleX, scaleY],
        }))

        const vid = o.video(c.datafile, {
          start: c.startTime,
          duration: c.duration,
        })

        o.set(vid.id, { spatialId: spatial.id })
        return vid
      })
      return o.stack(...items)
    })

    const p = await omni.playback(tl)
    playerRef.current = p
    setDuration(p.duration)
    setCurrentTime(resumeTime)

    // restore position
    if (resumeTime > 0) await p.seek(resumeTime)

    // apply mute via audioGain
    const hasMuted = targetClips.some(c => controls[c.id]?.muted)
    if (hasMuted && p.playback?.audioGain) {
      p.playback.audioGain.gain.value = 0
    } else if (p.playback?.audioGain) {
      p.playback.audioGain.gain.value = 1
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(p.canvas)
    }

    setIsBuilding(false)
  }

  // ─── Rebuild when ProjectPage confirms clip changes ─────────────────────────

  useEffect(() => {
    if (!clipsConfirmed) return
    buildTimeline(clips, clipControls).then(onClipsRebuildDone)
  }, [clipsConfirmed])

  // ─── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    async seek(ms: number) {
      if (!playerRef.current) return
      await playerRef.current.seek(ms)
      setCurrentTime(ms)
    },

    async setOffset(clipId: number, startTime: number) {
      // update the clip in clipsRef, then rebuild
      const updated = clipsRef.current.map(c =>
        c.id === clipId ? { ...c, startTime } : c
      )
      clipsRef.current = updated
      await buildTimeline(updated, clipControls)
    },
  }))

  // ─── rAF loop — poll currentTime, throttle onTimeUpdate to 500ms ───────────

  useEffect(() => {
    let rafId: number

    function tick() {
      if (playerRef.current) {
        const t = playerRef.current.currentTime
        setCurrentTime(t)
        setIsPlaying(playerRef.current.isPlaying)

        const now = performance.now()
        if (now - lastTimeUpdateRef.current >= 500) {
          onTimeUpdate(t)
          lastTimeUpdateRef.current = now
        }
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [onTimeUpdate])

  // ─── Keyboard controls ──────────────────────────────────────────────────────

  useEffect(() => {
    async function handleKeyDown(e: KeyboardEvent) {
      if (!playerRef.current || isEditing) return
      if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()

      if (e.key === ' ') {
        playerRef.current.isPlaying
          ? playerRef.current.pause()
          : playerRef.current.play()
      }
      if (e.key === 'ArrowLeft') {
        const next = Math.min(
            playerRef.current.duration,
            playerRef.current.currentTime - oneframe
        )
        playerRef.current.seek(next)
        await playerRef.current.seek(next)
      }
      if (e.key === 'ArrowRight') {
        const next = Math.min(
            playerRef.current.duration,
            playerRef.current.currentTime - oneframe
        )
        playerRef.current.seek(next)
        await playerRef.current.seek(next)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditing])

  // ─── Per-clip controls ──────────────────────────────────────────────────────

  function toggleMute(clipId: number) {
    setClipControls(prev => {
      const updated = {
        ...prev,
        [clipId]: {
          ...prev[clipId] ?? { muted: false, mirrored: false },
          muted: !(prev[clipId]?.muted ?? false),
        }
      }
      // apply immediately via audioGain without rebuild
      if (playerRef.current?.playback?.audioGain) {
        const anyMuted = Object.values(updated).some(c => c.muted)
        playerRef.current.playback.audioGain.gain.value = anyMuted ? 0 : 1
      }
      return updated
    })
  }

  function toggleMirror(clipId: number) {
    setClipControls(prev => {
      const updated = {
        ...prev,
        [clipId]: {
          ...prev[clipId] ?? { muted: false, mirrored: false },
          mirrored: !(prev[clipId]?.mirrored ?? false),
        }
      }
      // mirror requires rebuild
      buildTimeline(clipsRef.current, updated)
      return updated
    })
  }

  // ─── Scrubber helpers ───────────────────────────────────────────────────────

  function formatTime(totalMS: number) {
    const ms = Math.round(totalMS % 1000).toString().padStart(3, '0')
    const totalSec = Math.floor(totalMS / 1000)
    const min = Math.floor(totalSec / 60).toString().padStart(2, '0')
    const sec = (totalSec % 60).toString().padStart(2, '0')
    return `${min}:${sec}:${ms}`
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Canvas */}
      <div ref={containerRef} />

      {isBuilding && <p>Building timeline...</p>}

      {/* Playback controls */}
      {playerRef.current && (
        <div>
          <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            step={1}
            onChange={e => setCurrentTime(Number(e.target.value))}
            onPointerUp={async e => {
              const val = Number((e.target as HTMLInputElement).value)
              await playerRef.current?.seek(val)
            }}
          />
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          <button onClick={() => playerRef.current?.play()}>Play</button>
          <button onClick={() => playerRef.current?.pause()}>Pause</button>
        </div>
      )}

      {/* Per-clip controls */}
      {clips.map(c => (
        <div key={c.id}>
          <span>{c.file.name}</span>
          <button onClick={() => toggleMute(c.id)}>
            {clipControls[c.id]?.muted ? 'Unmute' : 'Mute'}
          </button>
          <button onClick={() => toggleMirror(c.id)}>
            {clipControls[c.id]?.mirrored ? 'Unmirrored' : 'Mirror'}
          </button>
        </div>
      ))}
    </div>
  )
})

export default OmniPlayer
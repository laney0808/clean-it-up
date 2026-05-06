import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Omni, Datafile } from '@omnimedia/omnitool'
import { Input, ALL_FORMATS, VideoSampleSink, BlobSource, EncodedPacketSink } from 'mediabunny'

interface Props {
  omni: Omni
}


interface ClipEntry {
  id: number
  file: File
  datafile: any
  startTime: number  // in ms
  duration: number   // in ms
}

function snapToFrame(ms: number, fps: number): number {
  const frameDuration = 1000/fps
  return Math.round(ms / frameDuration) * frameDuration
}

export default function PlayerPage({ omni }: Props) {
  // global variables
  const [clips, setClips] = useState<ClipEntry[]>([])
  const [isEditing, setIsEditing] = useState(false)

  //Local to canvas (will be gone after closing session)
  const containerRef = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<any>(null)
  const nextId = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const rafRef = useRef<number | null>(null)
  const playerRef = useRef<any>(null) // keep a ref for use in callbacks
  const [timelineFps, setTimelineFps] = useState(60)
  const timelineFpsRef = useRef(60)

  useEffect(() => {
    function tick() {
      if (playerRef.current && !isScrubbing) {
        setCurrentTime(playerRef.current.currentTime)
        setIsPlaying(playerRef.current.isPlaying)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isScrubbing])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!playerRef.current || isEditing) return //disallow if no video playing/user is editing something.

    // prevent default scroll behavior for arrow keys and space
    if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()

    if (e.key === ' ') {
      if (playerRef.current.isPlaying) {
        playerRef.current.pause()
      } else {
        playerRef.current.play()
      }
    }

    if (e.key === 'ArrowLeft') {
      const oneframe = 1000/timelineFps
      const next = Math.min(
        playerRef.current.duration,
        playerRef.current.currentTime - oneframe
      )
      playerRef.current.seek(next)
    }

    if (e.key === 'ArrowRight') {
      const oneframe = 1000/timelineFps
      const next = Math.min(
        playerRef.current.duration,
        playerRef.current.currentTime + oneframe
      )
      playerRef.current.seek(next)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Frame utilities
  function handleFpsChange(fps: number) {
    setTimelineFps(fps)
    timelineFpsRef.current = fps
    playerRef.current?.setFPS(fps)
  }

  //auxiliary functions
  async function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newClips: ClipEntry[] = []

    for (const file of Array.from(files)) {
      const key = `clip_${nextId.current}`
      const loaded = await omni.load({ [key]: Datafile.make(file) })

      newClips.push({
        id: nextId.current++,
        file,
        datafile: loaded[key],
        startTime: 0,
        duration: 10000,  // default 10s, user can adjust
      })
      
    }

    setClips(prev => [...prev, ...newClips])

    // reset input so same file can be added again
    e.target.value = ''
  }

  function updateClip(id: number, changes: Partial<ClipEntry>) {
    setClips(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c))
  }

  function removeClip(id: number) {
    setClips(prev => prev.filter(c => c.id !== id))
  }

  async function updateCanvas(clips: ClipEntry[]) {
    const tl = omni.timeline(o => {
        const videoItems = clips.map((c, i) => {
            const posX = 0
            const posY = 0

            const spatial = o.spatial(o.transform({
                position: [posX, posY],
            }))

            const vid = o.video(c.datafile, {
                start: c.startTime,
                duration: c.duration,
            })

            o.set(vid.id, { spatialId: spatial.id })
            return vid
        })
      return o.stack(
        ...videoItems
      )
    })
    
    playerRef.current.update(tl)
    console.log('updated player:', playerRef.current)
    setCurrentTime(0)
    setIsPlaying(false)
    await playerRef.current.seek(1)
  }

  async function buildAndPlay() {
    if (clips.length === 0) return

    const canvasWidth = 1280
    const canvasHeight = 720
    const count = clips.length
    const sliceWidth = canvasWidth / count
    const scale = 1 / count

    console.log('videos:', clips)
    const tl = omni.timeline(o => {
        const videoItems = clips.map((c, i) => {
            const posX = sliceWidth * i + sliceWidth / 2
            const posY = canvasHeight /2

            const spatial = o.spatial(o.transform({
                position: [posX, posY],
            }))

            const vid = o.video(c.datafile, {
                start: c.startTime,
                duration: c.duration,
            })

            o.set(vid.id, { spatialId: spatial.id })
            return vid
        })
      return o.stack(
        ...videoItems
      )
    })
    console.log(tl)

    const p = await omni.playback(tl)
    playerRef.current = p
    setPlayer(p)
    playerRef.current.setFPS(60)
    setDuration(p.duration)
    setCurrentTime(0)
    setIsPlaying(false)

    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(p.canvas)
    }
    await playerRef.current.seek(1)
  }
    function formatTime(totalMS: number) {
        const ms = (totalMS % 1000).toString().padStart(3, '0')
        const totalSec = Math.floor(totalMS / 1000)
        const min = Math.floor(totalSec / 60).toString().padStart(2, '0')
        const sec = (totalSec % 60).toString().padStart(2, '0')
        return `${min}:${sec}:${ms}`
    }

  return (
    <div>
      {/* File input */}
      <div>
        <input type="file" accept="video/*" multiple onChange={handleFileAdd} />
      </div>

      {/* Clip list */}
      {clips.length > 0 && (
        <div>
          {clips.map(clip => (
            <div key={clip.id}>
              <span>{clip.file.name}</span>
              <button onClick={() => removeClip(clip.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Build and play */}
      {clips.length > 0 && (
        <div>
        <button onClick={buildAndPlay}>Build Timeline</button>
        <button onClick={updateCanvas}>Update Canvas</button>
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} />

      {/* Playback controls */}
      {player && (
        <div>
            <input
            type="range"
            min={0}
            max={duration}
            value={currentTime}
            step={100}
            onMouseDown={() => setIsScrubbing(true)}
            onMouseUp={() => {
              setIsScrubbing(false)}
            }
            onChange={e => {
              const val = Number(e.target.value)
              console.log('value', val)
              setCurrentTime(val)
              console.log('current time:', currentTime)
              playerRef.current?.seek(val)
            }}
          />
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          <button onClick={() => player.play()}>Play</button>
          <button onClick={() => player.pause()}>Pause</button>
        </div>
      )}
    </div>
  )
}
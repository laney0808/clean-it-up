import React, { useRef, useState } from 'react'
import { Omni, Datafile } from '@omnimedia/omnitool'

interface Props {
  omni: Omni
}

export default function PlayerPage({ omni }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [player, setPlayer] = useState<any>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    console.log('handling file')
    const files = e.target.files
    if (!files || files.length < 1) return

    console.log("files selected", files[0].name)

    // const [bufA] = await Promise.all([
    //     files[0].arrayBuffer(),
    // ])

    // const blobA = new Blob([bufA], { type: files[0].type })

    console.log("files cloned", files[0].name)

    const { clipA } = await omni.load({
      clipA: Datafile.make(files[0]),
    })
    console.log("clips loaded", clipA)

    const tl = omni.timeline(o =>
      o.stack(
        o.video(clipA, { start: 0, duration: 10000 }),
      )
    )

    console.log("timeline created", tl)

    const p = await omni.playback(tl)

    console.log("player created", p)

    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      containerRef.current.appendChild(p.canvas)
      console.log("canvas appended")
    }

    setPlayer(p)
  }

  function handlePlay() {
    if (!player) {
        console.log('no player')
    }
    player.play()
    console.log('set to play')
  }

  return (
    <div>
      <input type="file" multiple accept="video/*" onChange={handleFiles} />
      <div ref={containerRef} />
      <div>
        <button onClick={handlePlay}>Play</button>
        <button onClick={() => player?.pause()}>Pause</button>
      </div>
    </div>
  )
}
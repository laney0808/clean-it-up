import { Driver, Omni, Datafile } from "@omnimedia/omnitool"

export async function initPlayer(file1: File, file2: File) {
  const workerUrl = new URL("/driver.worker.bundle.min.js", window.location.href)
  const driver = await Driver.setup({ workerUrl })
  const omni = new Omni(driver)

  // Load both files
  const { clipA, clipB } = await omni.load({
    clipA: Datafile.make(file1),
    clipB: Datafile.make(file2),
  })

  // Build the timeline
  // - clipA starts at t=0
  // - clipB starts at t=2000ms (2 seconds later)
  // stack() layers them on the canvas simultaneously
  // sequence() would play them one after the other — not what you want
  const tl = omni.timeline(o =>
    o.stack(
      o.video(clipA, { start: 0, duration: 10000 }),
      o.video(clipB, { start: 2000, duration: 10000 }),
    )
  )

  // Attach the canvas to your DOM
  const player = await omni.playback(tl)
  document.getElementById("player-container")!.appendChild(player.canvas)

  return player
}
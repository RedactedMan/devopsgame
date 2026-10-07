import { useState } from 'react'
import { useSim } from './bridge/useSim.js'
import { Board } from './render/Board.js'
import { Hud } from './ui/Hud.js'
import { TurnUpright } from './ui/Sideways.js'

/**
 * Free play. Presentation mode (`?present`, `?join=CODE`) was retired on
 * 2026-10-06 so the site fits Cloudflare's free plan; old links land here.
 */
export function App() {
  return <FreePlay />
}

function FreePlay() {
  const sim = useSim(20260830)
  const [touring, setTouring] = useState(false)
  return (
    <div className="app">
      <Hud sim={sim} touring={touring} onTour={setTouring} />
      <Board latest={sim.latest} />
      <TurnUpright />
    </div>
  )
}

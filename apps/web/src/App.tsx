import { useState } from 'react'
import { useSim } from './bridge/useSim.js'
import { Board } from './render/Board.js'
import { Hud } from './ui/Hud.js'
import { Join } from './session/Join.js'
import { Presenter } from './session/Presenter.js'
import { TurnUpright } from './ui/Sideways.js'

/**
 * Three ways in, chosen by the URL so a link is all anyone needs:
 *
 *   /               free play, the playtest build
 *   /?present       presentation mode: start a session, show the room its code,
 *                   and run the leaderboard (`?present=CODE` resumes one)
 *   /?join=CODE     a player in that session: same seed, fixed length, scored
 */
export function App() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('present')) return <Presenter code={params.get('present') || null} />
  if (params.has('join')) return <Join code={params.get('join') || null} />
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

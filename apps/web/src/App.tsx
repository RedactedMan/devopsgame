import { useSim } from './bridge/useSim.js'
import { Board } from './render/Board.js'
import { Hud } from './ui/Hud.js'

export function App() {
  const sim = useSim(20260830)
  return (
    <div className="app">
      <Hud sim={sim} />
      <Board latest={sim.latest} />
    </div>
  )
}

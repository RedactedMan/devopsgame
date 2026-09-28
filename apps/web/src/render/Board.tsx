import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@flow/sim'
import { BoardScene, type Inspected } from './BoardScene.js'
import { ItemCard } from '../ui/guide/ItemCard.js'

/**
 * React mounts the canvas and then stays out of its way. The scene pulls the
 * latest snapshot from a ref on Pixi's own ticker, so the board never waits on
 * a React render to move.
 *
 * The one thing React draws over it is the card for the item under the
 * pointer. It reads the same ref, and is fresh because whatever owns the sim
 * re-renders on every snapshot.
 */
export function Board({ latest }: { latest: { current: Snapshot } }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [inspected, setInspected] = useState<Inspected | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new BoardScene()
    scene.onInspect = setInspected
    void scene.mount(host, () => latest.current)
    return () => {
      scene.destroy()
      setInspected(null)
    }
  }, [latest])

  const item = inspected && latest.current.items.find((it) => it.id === inspected.id)
  return (
    <div className="board" ref={hostRef}>
      {inspected && item && <ItemCard item={item} at={inspected} host={hostRef.current} />}
    </div>
  )
}

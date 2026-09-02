import { useEffect, useRef } from 'react'
import type { Snapshot } from '@flow/sim'
import { BoardScene } from './BoardScene.js'

/**
 * React mounts the canvas and then stays out of its way. The scene pulls the
 * latest snapshot from a ref on Pixi's own ticker, so the board never waits on
 * a React render to move.
 */
export function Board({ latest }: { latest: { current: Snapshot } }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new BoardScene()
    void scene.mount(host, () => latest.current)
    return () => scene.destroy()
  }, [latest])

  return <div className="board" ref={hostRef} />
}

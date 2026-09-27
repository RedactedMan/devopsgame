import { useMemo } from 'react'
import { encode } from 'uqr'

/**
 * A QR code for the join link, drawn here rather than fetched from a QR
 * service: the link never leaves the page, and it works on venue wifi that
 * blocks everything but the game.
 *
 * Always dark on light, whatever the theme. Plenty of phone scanners do not
 * read an inverted code, and a projector washes out a dark background anyway.
 */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, path } = useMemo(() => {
    // Medium error correction survives a keystone-skewed, washed-out projector.
    // A four-module quiet zone is what the spec asks for; scanners need it.
    const qr = encode(value, { ecc: 'M', border: 4 })
    let d = ''
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`
      }),
    )
    return { size: qr.size, path: d }
  }, [value])

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`QR code for ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

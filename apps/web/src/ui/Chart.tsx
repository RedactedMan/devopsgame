import type { MetricSample } from '@flow/sim'
import { CSS_COLORS } from '../render/theme.js'

/**
 * Hand-rolled SVG. Two series is not a charting-library problem, and the plan
 * says lightweight until it isn't.
 */
export function Chart({
  samples,
  ticksPerHour,
}: {
  samples: MetricSample[]
  ticksPerHour: number
}) {
  const points = samples.slice(-160)
  if (points.length < 2) return <div className="chart chart--empty">gathering data…</div>

  const w = 100
  const h = 34
  const path = (pick: (s: MetricSample) => number, max: number) => {
    const scale = max > 0 ? max : 1
    return points
      .map((s, i) => {
        const x = (i / (points.length - 1)) * w
        const y = h - Math.min(1, pick(s) / scale) * h
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }

  const maxLead = Math.max(...points.map((s) => s.recentLeadTimeTicks), 1)
  const maxThroughput = Math.max(...points.map((s) => s.throughputPerDay), 1)
  const last = points[points.length - 1] as MetricSample

  return (
    <div className="chart">
      <Series
        label="Lead time"
        value={`${(last.recentLeadTimeTicks / ticksPerHour).toFixed(1)}h`}
        hint="arrival → production, last 8 shipped"
        color={CSS_COLORS.drift}
        d={path((s) => s.recentLeadTimeTicks, maxLead)}
        w={w}
        h={h}
      />
      <Series
        label="Throughput"
        value={`${last.throughputPerDay.toFixed(0)}/day`}
        hint="shipped, last sim-day"
        color={CSS_COLORS.flow}
        d={path((s) => s.throughputPerDay, maxThroughput)}
        w={w}
        h={h}
      />
    </div>
  )
}

function Series({
  label,
  value,
  hint,
  color,
  d,
  w,
  h,
}: {
  label: string
  value: string
  hint: string
  color: string
  d: string
  w: number
  h: number
}) {
  return (
    <div className="series">
      <div className="series__head">
        <span className="series__label">{label}</span>
        <span className="series__value" style={{ color }}>
          {value}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <path d={d} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="series__hint">{hint}</div>
    </div>
  )
}

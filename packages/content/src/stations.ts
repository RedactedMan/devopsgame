/**
 * The M0 pipeline: a hardcoded five-station subset of the full seven in the
 * design doc. Staging/Integration and Operate/Monitor arrive with M2.
 *
 * Deploy is not optional here even though it looks like the least interesting
 * station: it is the thing that advances the trunk version, and without a
 * moving trunk nothing drifts.
 */
export const STATION_IDS = ['spec', 'implement', 'review', 'ci', 'deploy'] as const

export type StationId = (typeof STATION_IDS)[number]

export const STATION_LABELS: Record<StationId, string> = {
  spec: 'Spec',
  implement: 'Implement',
  review: 'Review',
  ci: 'CI',
  deploy: 'Deploy',
}

/** The station rework sends an item back to. */
export const REWORK_STATION: StationId = 'implement'

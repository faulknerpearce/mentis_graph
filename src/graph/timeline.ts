export interface Lane {
  chain: string
  /** Centre line of the lane in graph units. */
  y: number
  height: number
  count: number
}

export interface TimeTick {
  x: number
  label: string
}

export interface TimelineLayout {
  /** Fixed position of every thought: one column per day, stacked in time order. */
  positions: Map<string, { x: number; y: number }>
  lanes: Map<string, Lane>
  ticks: TimeTick[]
  left: number
  right: number
  top: number
  bottom: number
}

/** Graph-space distance between stacked thoughts, and between wrapped columns. */
export const STACK_SPACING = 9
/** Radius every thought is drawn at in the timeline, so stacks line up. */
export const TIMELINE_NODE_SIZE = 3.4
/** Tallest a single day's stack grows before it wraps into another column. */
export const MAX_STACK = 16
const DAY_WIDTH = 16
const LANE_PADDING = 10
const LANE_GAP = 26
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (time: number) => Math.floor(time / DAY_MS)

/**
 * Lay thoughts out left to right by day, one horizontal lane per chain.
 * Within a lane, each day's thoughts form a vertical stack in time order,
 * starting at the top of the lane. Lanes are ordered by size (largest on top)
 * and are as tall as that chain's busiest day, up to MAX_STACK.
 */
export function timelineLayout(
  nodes: { id: string; chainKey: string; time: number }[],
): TimelineLayout {
  const valid = nodes.filter((n) => Number.isFinite(n.time))
  const firstDay = valid.length ? Math.min(...valid.map((n) => dayOf(n.time))) : 0
  const lastDay = valid.length ? Math.max(...valid.map((n) => dayOf(n.time))) : 0
  const width = (lastDay - firstDay + 1) * DAY_WIDTH
  const left = -width / 2
  const dayX = (day: number) => left + (day - firstDay + 0.5) * DAY_WIDTH

  // Group by chain, then by day, each group in time order.
  const byChain = new Map<string, Map<number, { id: string; time: number }[]>>()
  for (const node of valid) {
    const days = byChain.get(node.chainKey) ?? new Map()
    const day = dayOf(node.time)
    const list = days.get(day) ?? []
    list.push(node)
    days.set(day, list)
    byChain.set(node.chainKey, days)
  }

  const ordered = [...byChain.entries()]
    .map(([chain, days]) => {
      let count = 0
      let busiest = 0
      for (const list of days.values()) {
        count += list.length
        busiest = Math.max(busiest, list.length)
      }
      return { chain, days, count, rows: Math.min(busiest, MAX_STACK) }
    })
    .sort((a, b) => b.count - a.count || a.chain.localeCompare(b.chain))

  const heights = ordered.map((c) => Math.max(1, c.rows - 1) * STACK_SPACING + LANE_PADDING * 2)
  const total = heights.reduce((sum, h) => sum + h, 0) + LANE_GAP * Math.max(0, ordered.length - 1)

  const lanes = new Map<string, Lane>()
  const positions = new Map<string, { x: number; y: number }>()
  let cursor = -total / 2
  ordered.forEach((entry, i) => {
    const height = heights[i]
    const lane: Lane = { chain: entry.chain, y: cursor + height / 2, height, count: entry.count }
    lanes.set(entry.chain, lane)
    const top = cursor + LANE_PADDING
    for (const [day, list] of entry.days) {
      list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
      list.forEach((node, k) => {
        const column = Math.floor(k / MAX_STACK)
        const row = k % MAX_STACK
        positions.set(node.id, {
          x: dayX(day) + column * STACK_SPACING,
          y: top + row * STACK_SPACING,
        })
      })
    }
    cursor += height + LANE_GAP
  })

  const ticks = monthTicks(firstDay * DAY_MS, lastDay * DAY_MS).map((t) => ({
    x: dayX(dayOf(t.time)) - DAY_WIDTH / 2,
    label: t.label,
  }))

  return {
    positions,
    lanes,
    ticks,
    left,
    right: left + width,
    top: -total / 2,
    bottom: total / 2,
  }
}

/** First day of each month inside [min, max], labelled "Apr" or "Jan 2027". */
export function monthTicks(min: number, max: number): { time: number; label: string }[] {
  if (!(max > min)) return []
  const ticks: { time: number; label: string }[] = []
  const start = new Date(min)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  while (cursor.getTime() <= max) {
    const first = ticks.length === 0
    const month = cursor.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
    const label = first || cursor.getUTCMonth() === 0 ? `${month} ${cursor.getUTCFullYear()}` : month
    ticks.push({ time: cursor.getTime(), label })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return ticks
}

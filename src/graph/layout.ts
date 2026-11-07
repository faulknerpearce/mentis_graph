export interface Anchor {
  x: number
  y: number
  radius: number
}

const SPACING = 15
const GAP = 90
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function clusterRadius(count: number): number {
  return Math.sqrt(Math.max(count, 1)) * SPACING + 20
}

/**
 * Give each chain its own region: the largest chain sits in the middle and the
 * rest are packed around it along a golden-angle spiral without overlapping.
 */
export function chainAnchors(counts: Map<string, number>): Map<string, Anchor> {
  const chains = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const placed: Anchor[] = []
  const anchors = new Map<string, Anchor>()

  for (const [key, count] of chains) {
    const radius = clusterRadius(count)
    let anchor: Anchor = { x: 0, y: 0, radius }
    for (let step = 0; placed.length > 0; step++) {
      const distance = 12 * Math.sqrt(step)
      const angle = step * GOLDEN_ANGLE
      anchor = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, radius }
      const clear = placed.every(
        (p) => Math.hypot(p.x - anchor.x, p.y - anchor.y) >= p.radius + radius + GAP,
      )
      if (clear) break
    }
    placed.push(anchor)
    anchors.set(key, anchor)
  }

  return anchors
}

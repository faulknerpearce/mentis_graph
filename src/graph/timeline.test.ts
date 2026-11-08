import { describe, expect, it } from 'vitest'
import { MAX_STACK, STACK_SPACING, monthTicks, timelineLayout } from './timeline'

const hour = 60 * 60 * 1000
const day = 24 * hour
const t0 = Date.UTC(2026, 3, 8)

function node(id: string, chainKey: string, time: number) {
  return { id, chainKey, time }
}

describe('timelineLayout', () => {
  it('stacks one day of a chain in a vertical line, in time order', () => {
    const layout = timelineLayout([
      node('late', 'a', t0 + 9 * hour),
      node('early', 'a', t0 + 1 * hour),
      node('mid', 'a', t0 + 5 * hour),
    ])
    const early = layout.positions.get('early')!
    const mid = layout.positions.get('mid')!
    const late = layout.positions.get('late')!
    expect(mid.x).toBe(early.x)
    expect(late.x).toBe(early.x)
    expect(mid.y - early.y).toBe(STACK_SPACING)
    expect(late.y - mid.y).toBe(STACK_SPACING)
  })

  it('puts later days further right', () => {
    const layout = timelineLayout([node('d0', 'a', t0), node('d3', 'a', t0 + 3 * day)])
    expect(layout.positions.get('d3')!.x).toBeGreaterThan(layout.positions.get('d0')!.x)
  })

  it('wraps a very busy day into a second column', () => {
    const many = Array.from({ length: MAX_STACK + 2 }, (_, i) => node(`n${i}`, 'a', t0 + i * 1000))
    const layout = timelineLayout(many)
    const first = layout.positions.get('n0')!
    const wrapped = layout.positions.get(`n${MAX_STACK}`)!
    expect(wrapped.x).toBe(first.x + STACK_SPACING)
    expect(wrapped.y).toBe(first.y)
  })

  it('keeps every stack inside its own lane, lanes ordered largest first', () => {
    const layout = timelineLayout([
      node('s1', 'small', t0),
      node('b1', 'big', t0),
      node('b2', 'big', t0 + hour),
      node('b3', 'big', t0 + day),
    ])
    const lanes = [...layout.lanes.values()]
    expect(lanes.map((l) => l.chain)).toEqual(['big', 'small'])
    for (const [id, pos] of layout.positions) {
      const lane = layout.lanes.get(id.startsWith('b') ? 'big' : 'small')!
      expect(pos.y).toBeGreaterThanOrEqual(lane.y - lane.height / 2)
      expect(pos.y).toBeLessThanOrEqual(lane.y + lane.height / 2)
    }
    expect(lanes[1].y - lanes[1].height / 2).toBeGreaterThan(lanes[0].y + lanes[0].height / 2)
  })

  it('handles an empty graph', () => {
    const layout = timelineLayout([])
    expect(layout.lanes.size).toBe(0)
    expect(layout.positions.size).toBe(0)
    expect(layout.ticks).toEqual([])
  })
})

describe('monthTicks', () => {
  it('marks each month start and names the year on the first and in January', () => {
    const ticks = monthTicks(Date.UTC(2026, 10, 10), Date.UTC(2027, 2, 2))
    expect(ticks.map((t) => t.label)).toEqual(['Dec 2026', 'Jan 2027', 'Feb', 'Mar'])
    expect(ticks[0].time).toBe(Date.UTC(2026, 11, 1))
  })

  it('returns nothing for an empty range', () => {
    expect(monthTicks(t0, t0)).toEqual([])
  })
})

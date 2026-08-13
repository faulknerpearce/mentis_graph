import type { FacetOption, Thought } from '../types'

export function facetOptions(
  thoughts: Thought[],
  keyOf: (t: Thought) => string,
  colorFor?: (value: string) => string | undefined,
): FacetOption[] {
  const counts = new Map<string, number>()
  for (const t of thoughts) {
    const key = keyOf(t)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      ...(colorFor ? { color: colorFor(value) } : {}),
    }))
}

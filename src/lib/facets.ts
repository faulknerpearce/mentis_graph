import type { FacetOption } from '../types'

export function facetOptions<T>(
  items: T[],
  keyOf: (item: T) => string,
  colorFor?: (value: string) => string,
): FacetOption[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = keyOf(item)
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

/**
 * Toggle `values` in a facet selection where null means "everything".
 * Values are removed when all are currently selected, otherwise added.
 * Returns null again once every option is selected.
 */
export function toggleFacet(
  selection: Set<string> | null,
  values: string[],
  all: string[],
): Set<string> | null {
  const next = new Set(selection ?? all)
  const allOn = values.every((v) => next.has(v))
  for (const v of values) {
    if (allOn) next.delete(v)
    else next.add(v)
  }
  return all.every((v) => next.has(v)) ? null : next
}

import type { Theme } from '../hooks/useTheme'
import { OTHER_FAMILY } from '../graph/taxonomy'
import type { ColorMode, EdgeCategory, GraphLink, GraphNode, MapData } from '../types'

export interface CanvasPalette {
  /** Solid fallback for the WebGL renderer; the 2D canvas is transparent. */
  background: string
  label: string
  labelHalo: string
  chainLabel: string
  ring: string
  topic: string
  dimAlpha: number
  linkAlpha: Record<EdgeCategory, number>
}

export const CANVAS: Record<Theme, CanvasPalette> = {
  dark: {
    background: '#0e0e0f',
    label: 'rgba(231, 227, 219, 0.9)',
    labelHalo: 'rgba(14, 14, 15, 0.88)',
    chainLabel: 'rgba(214, 208, 198, 0.3)',
    ring: '#ece8e1',
    topic: '#d9d4ca',
    dimAlpha: 0.1,
    linkAlpha: { lineage: 0.5, reasoning: 0.55, reference: 0.17, session: 0.42, sequence: 0.14, topic: 0.11 },
  },
  light: {
    background: '#f4f2ee',
    label: 'rgba(41, 37, 36, 0.9)',
    labelHalo: 'rgba(244, 242, 238, 0.92)',
    chainLabel: 'rgba(68, 64, 60, 0.32)',
    ring: '#292524',
    topic: '#44403c',
    dimAlpha: 0.14,
    linkAlpha: { lineage: 0.55, reasoning: 0.6, reference: 0.22, session: 0.45, sequence: 0.18, topic: 0.15 },
  },
}

const FAMILY_COLORS: Record<Theme, Record<string, string>> = {
  dark: {
    decision: '#9fb3c8',
    knowledge: '#8fb5ad',
    lesson: '#a9bd92',
    correction: '#d39d8c',
    progress: '#d4bd8e',
    summary: '#8e8999',
    inquiry: '#c3a1b3',
    [OTHER_FAMILY]: '#8b8f96',
  },
  light: {
    decision: '#5b7690',
    knowledge: '#4d7e75',
    lesson: '#6a8354',
    correction: '#a5604e',
    progress: '#9b7f42',
    summary: '#7a7484',
    inquiry: '#94667d',
    [OTHER_FAMILY]: '#7b7f87',
  },
}

/** Distinct categorical hues for chains and agents, ordered by size. */
const CATEGORICAL: Record<Theme, string[]> = {
  dark: [
    '#9fb3c8', '#a9bd92', '#d4bd8e', '#d39d8c', '#8fb5ad', '#b5a6c9',
    '#c3a1b3', '#c9b79c', '#93a8a0', '#b8a48c', '#a3aebd', '#c4c09a',
    '#a99a8e', '#9db8c2', '#bfa5a0', '#a5b29a',
  ],
  light: [
    '#5b7690', '#6a8354', '#9b7f42', '#a5604e', '#4d7e75', '#76689a',
    '#94667d', '#8a7350', '#5e7a70', '#83694c', '#5f6f86', '#7c7a45',
    '#7b6a5e', '#4f7f8f', '#8f6560', '#68795a',
  ],
}

const RELATION_COLORS: Record<Theme, Record<string, string>> = {
  dark: {
    Supersedes: '#d4b48e',
    Corrects: '#d39d8c',
    Invalidates: '#c98b7c',
    Contradicts: '#c98b7c',
    DerivedFrom: '#9fb3c8',
    Supports: '#a9bd92',
    CausedBy: '#d4bd8e',
    Summarizes: '#b5a6c9',
    ContinuesFrom: '#9fb3c8',
    BranchesFrom: '#b5a6c9',
    RelatedTo: '#8fb5ad',
    References: '#a19c94',
    Mentions: '#a19c94',
    SameSession: '#c9c2b5',
    About: '#bdb7ad',
    Precedes: '#8a857e',
  },
  light: {
    Supersedes: '#9b7445',
    Corrects: '#a5604e',
    Invalidates: '#94503f',
    Contradicts: '#94503f',
    DerivedFrom: '#5b7690',
    Supports: '#6a8354',
    CausedBy: '#9b7f42',
    Summarizes: '#76689a',
    ContinuesFrom: '#5b7690',
    BranchesFrom: '#76689a',
    RelatedTo: '#4d7e75',
    References: '#78716c',
    Mentions: '#78716c',
    SameSession: '#57534e',
    About: '#57534e',
    Precedes: '#a8a29e',
  },
}

export function familyColor(family: string, theme: Theme): string {
  return FAMILY_COLORS[theme][family] ?? FAMILY_COLORS[theme][OTHER_FAMILY]
}

export function relationColor(kind: string, theme: Theme): string {
  return RELATION_COLORS[theme][kind] ?? RELATION_COLORS[theme].References
}

/** Stable colour per value: values are ranked by frequency, then cycled. */
export function categoricalScale(
  rankedValues: string[],
  theme: Theme,
): (value: string) => string {
  const palette = CATEGORICAL[theme]
  const lookup = new Map(rankedValues.map((v, i) => [v, palette[i % palette.length]]))
  return (value) => lookup.get(value) ?? palette[palette.length - 1]
}

export function linkColor(link: GraphLink, theme: Theme): string {
  return withAlpha(relationColor(link.kind, theme), CANVAS[theme].linkAlpha[link.category])
}

export function linkWidth(link: GraphLink): number {
  if (link.category === 'lineage') return 1.1
  if (link.category === 'reasoning' || link.category === 'session') return 1
  return 0.55
}

export function colorizeGraph(
  data: MapData,
  theme: Theme,
  nodeColor: (node: GraphNode) => string,
): MapData {
  return {
    nodes: data.nodes.map((node) => ({
      ...node,
      color: node.kind === 'topic' ? CANVAS[theme].topic : nodeColor(node),
    })),
    links: data.links.map((link) => ({ ...link, color: linkColor(link, theme) })),
  }
}

export function nodeColorFn(
  mode: ColorMode,
  theme: Theme,
  chainColor: (chain: string) => string,
  agentColor: (agent: string) => string,
): (node: GraphNode) => string {
  if (mode === 'chain') return (node) => chainColor(node.chainKey)
  if (mode === 'agent') return (node) => agentColor(node.agent)
  return (node) => familyColor(node.family, theme)
}

/** Muted ochre ring for contested thoughts. */
export const CONTESTED_RING = '#c9a66b'

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba(')) {
    return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`)
  }
  const raw = color.replace('#', '')
  if (raw.length !== 6) return color
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

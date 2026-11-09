import type { Theme } from '../hooks/useTheme'
import type {
  ColorMode,
  EdgeCategory,
  GraphLink,
  GraphNode,
  MapData,
  RelationCategory,
} from '../types'

export interface CanvasPalette {
  background: string
  label: string
  selectedStroke: string
  topic: string
  linkFallback: string
  dimOpacity: number
  /** Solid fill for topic hubs, a step off the background. */
  topicFill: string
  labelFont: string
}

export const CANVAS: Record<Theme, CanvasPalette> = {
  light: {
    background: '#f4f6f8',
    label: '#4a5562',
    selectedStroke: '#1a2332',
    topic: '#5b6570',
    linkFallback: 'rgba(90, 100, 112, 0.36)',
    dimOpacity: 0.28,
    topicFill: '#e4e8ec',
    labelFont: '500 1em "Sora", system-ui, sans-serif',
  },
  dark: {
    background: '#0a0c10',
    label: '#9aa3ad',
    selectedStroke: '#eef2f6',
    topic: '#9aa3ad',
    linkFallback: 'rgba(160, 170, 185, 0.34)',
    dimOpacity: 0.22,
    topicFill: '#171b22',
    labelFont: '500 1em "Sora", system-ui, sans-serif',
  },
}

const TYPE_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    Decision: '#2f6fed',
    PreferenceUpdate: '#4f6fd6',
    StrategyShift: '#5a52c9',
    LessonLearned: '#1a9a5c',
    Correction: '#d64545',
    AssumptionInvalidated: '#d97706',
    Constraint: '#7c5cbf',
    Summary: '#5b6570',
    Checkpoint: '#6b7280',
    Plan: '#0b8fbf',
    Subgoal: '#2899c4',
    TaskComplete: '#0d9a6e',
    ActionTaken: '#4a9a2e',
    Handoff: '#b06a2b',
    Question: '#b8860b',
    Wonder: '#c27803',
    Idea: '#c9a227',
    Hypothesis: '#6d5bd0',
    StateSnapshot: '#0f9a8a',
    Mistake: '#c53030',
    Insight: '#0e8f9e',
    FactLearned: '#3a8f3a',
    Finding: '#2a8a74',
    PatternDetected: '#8a5cc2',
    LLMExtracted: '#7a8494',
  },
  dark: {
    Decision: '#6b9fff',
    PreferenceUpdate: '#8aa6ff',
    StrategyShift: '#9b93ff',
    LessonLearned: '#3dd68c',
    Correction: '#ff7b7b',
    AssumptionInvalidated: '#f0a04b',
    Constraint: '#b49aff',
    Summary: '#9aa3ad',
    Checkpoint: '#8b939e',
    Plan: '#4ec4ef',
    Subgoal: '#6dd3f0',
    TaskComplete: '#3ddeb0',
    ActionTaken: '#93d96b',
    Handoff: '#e8a467',
    Question: '#e8c547',
    Wonder: '#f0b84a',
    Idea: '#f0d35a',
    Hypothesis: '#a794ff',
    StateSnapshot: '#3dceb8',
    Mistake: '#ff6b6b',
    Insight: '#45d0de',
    FactLearned: '#7fd67f',
    Finding: '#5fd1b5',
    PatternDetected: '#c29cff',
    LLMExtracted: '#a8b0bc',
  },
}

const FALLBACK_TYPE: Record<Theme, string> = {
  light: '#6b7280',
  dark: '#8b939e',
}

/** Distinct categorical hues for chains and agents, ordered by size. */
const CATEGORICAL: Record<Theme, string[]> = {
  light: [
    '#2f6fed', '#1a9a5c', '#d97706', '#7c5cbf', '#0b8fbf', '#d64545',
    '#b8860b', '#0f9a8a', '#c73d6a', '#6d5bd0', '#4a9a2e', '#b06a2b',
    '#0e8f9e', '#8a5cc2', '#5b6570', '#2899c4',
  ],
  dark: [
    '#6b9fff', '#3dd68c', '#f0a04b', '#b49aff', '#4ec4ef', '#ff7b7b',
    '#e8c547', '#3dceb8', '#ff7aa0', '#a794ff', '#93d96b', '#e8a467',
    '#45d0de', '#c29cff', '#9aa3ad', '#6dd3f0',
  ],
}

const RELATION_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    CausedBy: '#c27803',
    Corrects: '#d64545',
    Invalidates: '#c53030',
    Contradicts: '#d97706',
    Supersedes: '#c73d6a',
    DerivedFrom: '#2f6fed',
    Summarizes: '#5b6570',
    References: '#7a8494',
    Mentions: '#7a8494',
    Supports: '#1a9a5c',
    ContinuesFrom: '#0b8fbf',
    BranchesFrom: '#7c5cbf',
    RelatedTo: '#0f9a8a',
    SameSession: '#8a6fb0',
    About: '#7a8494',
  },
  dark: {
    CausedBy: '#f0b84a',
    Corrects: '#ff7b7b',
    Invalidates: '#ff6b6b',
    Contradicts: '#f0a04b',
    Supersedes: '#ff7aa0',
    DerivedFrom: '#6b9fff',
    Summarizes: '#9aa3ad',
    References: '#a8b0bc',
    Mentions: '#a8b0bc',
    Supports: '#3dd68c',
    ContinuesFrom: '#4ec4ef',
    BranchesFrom: '#b49aff',
    RelatedTo: '#3dceb8',
    SameSession: '#c0a8e6',
    About: '#a8b0bc',
  },
}

const FALLBACK_RELATION: Record<Theme, string> = {
  light: '#7a8494',
  dark: '#a8b0bc',
}

/** Typed relations are softened so they do not overpower the canvas. */
const RELATION_OPACITY: Record<Theme, number> = {
  light: 0.52,
  dark: 0.58,
}

const REF_COLOR: Record<Theme, string> = {
  light: 'rgba(90, 100, 112, 0.46)',
  dark: 'rgba(160, 170, 185, 0.42)',
}

const SPINE_COLOR: Record<Theme, string> = {
  light: 'rgba(90, 100, 112, 0.3)',
  dark: 'rgba(160, 170, 185, 0.28)',
}

const TOPIC_LINK_COLOR: Record<Theme, string> = {
  light: 'rgba(90, 100, 112, 0.2)',
  dark: 'rgba(160, 170, 185, 0.18)',
}

/** Ring drawn round a contested thought. */
export const CONTESTED_RING: Record<Theme, string> = {
  light: '#d97706',
  dark: '#f0a04b',
}

export function typeColor(thoughtType: string, theme: Theme): string {
  return TYPE_COLORS[theme][thoughtType] ?? FALLBACK_TYPE[theme]
}

export function relationColor(kind: string, theme: Theme): string {
  return RELATION_COLORS[theme][kind] ?? FALLBACK_RELATION[theme]
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

export function linkColor(link: Pick<GraphLink, 'category' | 'kind'>, theme: Theme): string {
  switch (link.category) {
    case 'sequence':
      return SPINE_COLOR[theme]
    case 'reference':
      return REF_COLOR[theme]
    case 'topic':
      return TOPIC_LINK_COLOR[theme]
    default:
      return withAlpha(relationColor(link.kind, theme), RELATION_OPACITY[theme])
  }
}

export function linkWidth(category: EdgeCategory): number {
  if (category === 'sequence') return 0.55
  if (category === 'topic') return 0.5
  return 0.75
}

/** Dashed references, dotted session links, solid everything else. */
export function linkDash(category: EdgeCategory): number[] | null {
  if (category === 'reference') return [3.5, 2.5]
  if (category === 'session') return [1.2, 1.8]
  return null
}

const EDGE_SAMPLE_KIND: Record<RelationCategory, string> = {
  lineage: 'Supersedes',
  reasoning: 'DerivedFrom',
  reference: 'References',
  session: 'SameSession',
  sequence: 'Precedes',
}

/** Legend swatch for a connection category, a little stronger than on canvas. */
export function edgeSampleColor(category: RelationCategory, theme: Theme): string {
  const color = linkColor({ category, kind: EDGE_SAMPLE_KIND[category] }, theme)
  return withAlpha(color, 0.85)
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
  return (node) => typeColor(node.thoughtType, theme)
}

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

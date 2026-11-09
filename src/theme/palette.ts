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
    Decision: '#4f6f9f',
    PreferenceUpdate: '#5a6a96',
    StrategyShift: '#6a6496',
    LessonLearned: '#4f8566',
    Correction: '#a5574f',
    AssumptionInvalidated: '#a57340',
    Constraint: '#76689c',
    Summary: '#5b6570',
    Checkpoint: '#6b7280',
    Plan: '#4a7f96',
    Subgoal: '#5a8a9c',
    TaskComplete: '#4a8676',
    ActionTaken: '#6a8450',
    Handoff: '#93694a',
    Question: '#968440',
    Wonder: '#937640',
    Idea: '#9a8c50',
    Hypothesis: '#6a5f9c',
    StateSnapshot: '#4a807a',
    Mistake: '#a05050',
    Insight: '#4a8288',
    FactLearned: '#5f845a',
    Finding: '#52806f',
    PatternDetected: '#7a6296',
    LLMExtracted: '#7a8494',
  },
  dark: {
    Decision: '#7f9cc9',
    PreferenceUpdate: '#8a9bc2',
    StrategyShift: '#9a92c0',
    LessonLearned: '#7fae92',
    Correction: '#c98a84',
    AssumptionInvalidated: '#c9a072',
    Constraint: '#a595c4',
    Summary: '#9aa3ad',
    Checkpoint: '#8b939e',
    Plan: '#7aaabf',
    Subgoal: '#8ab5c4',
    TaskComplete: '#78b0a0',
    ActionTaken: '#9ab07e',
    Handoff: '#c09a7a',
    Question: '#c9b878',
    Wonder: '#c4a878',
    Idea: '#cfc08a',
    Hypothesis: '#9a8fc4',
    StateSnapshot: '#78aaa2',
    Mistake: '#c47e7e',
    Insight: '#7aaeb4',
    FactLearned: '#8fb08a',
    Finding: '#80ab9d',
    PatternDetected: '#a990c0',
    LLMExtracted: '#a8b0bc',
  },
}

const FALLBACK_TYPE: Record<Theme, string> = {
  light: '#6b7280',
  dark: '#8b939e',
}

/** Distinct muted categorical hues for chains and agents, ordered by size. */
const CATEGORICAL: Record<Theme, string[]> = {
  light: [
    '#4f6f9f', '#4f8566', '#a57340', '#76689c', '#4a7f96', '#a5574f',
    '#968440', '#4a807a', '#9a5a74', '#6a5f9c', '#6a8450', '#93694a',
    '#4a8288', '#7a6296', '#5b6570', '#5a8a9c',
  ],
  dark: [
    '#7f9cc9', '#7fae92', '#c9a072', '#a595c4', '#7aaabf', '#c98a84',
    '#c9b878', '#78aaa2', '#c08aa0', '#9a8fc4', '#9ab07e', '#c09a7a',
    '#7aaeb4', '#a990c0', '#9aa3ad', '#8ab5c4',
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

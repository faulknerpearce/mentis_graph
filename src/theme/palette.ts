import type { Theme } from '../hooks/useTheme'
import type { GraphData, GraphLink, RelationKind } from '../types'

export interface CanvasPalette {
  background: string
  label: string
  selectedStroke: string
  linkFallback: string
  dimOpacity: number
  haloSelected: number
  haloLarge: number
  labelFont: string
}

const TYPE_COLORS_LIGHT: Record<string, string> = {
  Decision: '#2f6fed',
  LessonLearned: '#1a9a5c',
  Correction: '#d64545',
  AssumptionInvalidated: '#d97706',
  Constraint: '#7c5cbf',
  Summary: '#5b6570',
  Checkpoint: '#6b7280',
  Plan: '#0b8fbf',
  Subgoal: '#2899c4',
  TaskComplete: '#0d9a6e',
  Question: '#b8860b',
  Wonder: '#c27803',
  Hypothesis: '#6d5bd0',
  StateSnapshot: '#0f9a8a',
  Mistake: '#c53030',
  LLMExtracted: '#7a8494',
}

const TYPE_COLORS_DARK: Record<string, string> = {
  Decision: '#6b9fff',
  LessonLearned: '#3dd68c',
  Correction: '#ff7b7b',
  AssumptionInvalidated: '#f0a04b',
  Constraint: '#b49aff',
  Summary: '#9aa3ad',
  Checkpoint: '#8b939e',
  Plan: '#4ec4ef',
  Subgoal: '#6dd3f0',
  TaskComplete: '#3ddeb0',
  Question: '#e8c547',
  Wonder: '#f0b84a',
  Hypothesis: '#a794ff',
  StateSnapshot: '#3dceb8',
  Mistake: '#ff6b6b',
  LLMExtracted: '#a8b0bc',
}

const RELATION_COLORS_LIGHT: Record<string, string> = {
  CausedBy: '#c27803',
  Corrects: '#d64545',
  Invalidates: '#c53030',
  Supersedes: '#c73d6a',
  DerivedFrom: '#2f6fed',
  Summarizes: '#5b6570',
  References: '#7a8494',
  Supports: '#1a9a5c',
  ContinuesFrom: '#0b8fbf',
  BranchesFrom: '#7c5cbf',
}

const RELATION_COLORS_DARK: Record<string, string> = {
  CausedBy: '#f0b84a',
  Corrects: '#ff7b7b',
  Invalidates: '#ff6b6b',
  Supersedes: '#ff7aa0',
  DerivedFrom: '#6b9fff',
  Summarizes: '#9aa3ad',
  References: '#a8b0bc',
  Supports: '#3dd68c',
  ContinuesFrom: '#4ec4ef',
  BranchesFrom: '#b49aff',
}

const FALLBACK_TYPE: Record<Theme, string> = {
  light: '#6b7280',
  dark: '#8b939e',
}

const FALLBACK_RELATION: Record<Theme, string> = {
  light: '#7a8494',
  dark: '#a8b0bc',
}

/** Soften typed relations so they don't overpower the canvas. */
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

function withHexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return hex
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const CANVAS: Record<Theme, CanvasPalette> = {
  light: {
    background: '#f4f6f8',
    label: '#4a5562',
    selectedStroke: '#1a2332',
    linkFallback: 'rgba(90, 100, 112, 0.36)',
    dimOpacity: 0.28,
    haloSelected: 0.2,
    haloLarge: 0.1,
    labelFont: '500 1em "Sora", system-ui, sans-serif',
  },
  dark: {
    background: '#0a0c10',
    label: '#9aa3ad',
    selectedStroke: '#eef2f6',
    linkFallback: 'rgba(160, 170, 185, 0.34)',
    dimOpacity: 0.22,
    haloSelected: 0.32,
    haloLarge: 0.16,
    labelFont: '500 1em "Sora", system-ui, sans-serif',
  },
}

export function typeColors(theme: Theme): Record<string, string> {
  return theme === 'dark' ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT
}

export function colorForThoughtType(thoughtType: string, theme: Theme): string {
  const map = typeColors(theme)
  return map[thoughtType] ?? FALLBACK_TYPE[theme]
}

export function colorForRelation(kind: RelationKind, theme: Theme): string {
  const map = theme === 'dark' ? RELATION_COLORS_DARK : RELATION_COLORS_LIGHT
  const hex = map[kind] ?? FALLBACK_RELATION[theme]
  return withHexAlpha(hex, RELATION_OPACITY[theme])
}

export function colorForLink(link: GraphLink, theme: Theme): string {
  if (link.kind === 'spine') return SPINE_COLOR[theme]
  if (link.kind === 'ref') return REF_COLOR[theme]
  if (link.relationKind) return colorForRelation(link.relationKind, theme)
  return CANVAS[theme].linkFallback
}

export function linkWidthForKind(kind: GraphLink['kind']): number {
  if (kind === 'spine') return 0.55
  if (kind === 'ref') return 0.75
  return 0.75
}

/** Dashed pattern for refs; solid for others. */
export function linkDashForKind(
  kind: GraphLink['kind'],
): number[] | null {
  if (kind === 'ref') return [3.5, 2.5]
  return null
}

export function colorizeGraph(data: GraphData, theme: Theme): GraphData {
  return {
    nodes: data.nodes.map((node) => ({
      ...node,
      color: colorForThoughtType(node.thoughtType, theme),
    })),
    links: data.links.map((link) => ({
      ...link,
      color: colorForLink(link, theme),
    })),
  }
}

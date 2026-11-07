import type { RelationCategory } from '../types'

export interface TypeFamily {
  id: string
  label: string
  types: string[]
}

/** Thought types grouped by what they say about memory. */
export const TYPE_FAMILIES: TypeFamily[] = [
  {
    id: 'decision',
    label: 'Decisions & rules',
    types: ['Decision', 'Constraint', 'PreferenceUpdate', 'StrategyShift', 'Plan', 'Subgoal'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    types: ['Insight', 'FactLearned', 'Finding', 'PatternDetected', 'LLMExtracted'],
  },
  {
    id: 'lesson',
    label: 'Lessons',
    types: ['LessonLearned'],
  },
  {
    id: 'correction',
    label: 'Corrections & mistakes',
    types: ['Correction', 'Mistake', 'AssumptionInvalidated'],
  },
  {
    id: 'progress',
    label: 'Progress',
    types: ['TaskComplete', 'ActionTaken', 'StateSnapshot', 'Checkpoint', 'Handoff'],
  },
  {
    id: 'summary',
    label: 'Summaries',
    types: ['Summary'],
  },
  {
    id: 'inquiry',
    label: 'Questions & ideas',
    types: ['Question', 'Wonder', 'Hypothesis', 'Idea'],
  },
]

export const OTHER_FAMILY = 'other'

const FAMILY_BY_TYPE = new Map(
  TYPE_FAMILIES.flatMap((family) => family.types.map((t) => [t, family.id])),
)

export function familyOf(thoughtType: string): string {
  return FAMILY_BY_TYPE.get(thoughtType) ?? OTHER_FAMILY
}

/** Successor kinds that hide the target from default MentisDB retrieval. */
export const RETIRING_KINDS = new Set(['Supersedes', 'Corrects', 'Invalidates'])
/** Successor kinds that flag the target as contested but keep it visible. */
export const CONTESTING_KINDS = new Set(['Contradicts'])
/**
 * A thought that retires more than this many others is a bulk cleanup, not a
 * new version of each one, so it never becomes their "current" thought.
 */
export const ARCHIVE_THRESHOLD = 8

const CATEGORY_BY_KIND: Record<string, RelationCategory> = {
  Supersedes: 'lineage',
  Corrects: 'lineage',
  Invalidates: 'lineage',
  Contradicts: 'lineage',
  References: 'reference',
}

export function categoryOfRelation(kind: string): RelationCategory {
  return CATEGORY_BY_KIND[kind] ?? 'reasoning'
}

export const EDGE_CATEGORIES: { id: RelationCategory; label: string; hint: string }[] = [
  { id: 'lineage', label: 'Lineage', hint: 'Supersedes, corrects, invalidates' },
  { id: 'reasoning', label: 'Reasoning', hint: 'Derived from, supports, caused by' },
  { id: 'reference', label: 'References', hint: 'Back-references and #N mentions' },
  { id: 'session', label: 'Sessions', hint: 'Written in the same working burst' },
  { id: 'sequence', label: 'Sequence', hint: 'Append order within a chain' },
]

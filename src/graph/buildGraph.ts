import type {
  EdgeToggles,
  GraphData,
  GraphFilters,
  GraphLink,
  GraphNode,
  RelationKind,
  Thought,
} from '../types'

/** Saturated accents that read well on cream (cabinet-style) and dark canvases. */
const TYPE_COLORS: Record<string, string> = {
  Decision: '#3b82f6',
  LessonLearned: '#22c55e',
  Correction: '#ef4444',
  AssumptionInvalidated: '#f97316',
  Constraint: '#a855f7',
  Summary: '#64748b',
  Checkpoint: '#78716c',
  Plan: '#0ea5e9',
  Subgoal: '#38bdf8',
  TaskComplete: '#10b981',
  Question: '#eab308',
  Wonder: '#f59e0b',
  Hypothesis: '#8b5cf6',
  StateSnapshot: '#14b8a6',
  Mistake: '#dc2626',
  LLMExtracted: '#94a3b8',
}

const RELATION_COLORS: Record<string, string> = {
  CausedBy: '#f59e0b',
  Corrects: '#ef4444',
  Invalidates: '#dc2626',
  Supersedes: '#e11d48',
  DerivedFrom: '#3b82f6',
  Summarizes: '#78716c',
  References: '#a8a29e',
  Supports: '#22c55e',
  ContinuesFrom: '#0ea5e9',
  BranchesFrom: '#a855f7',
}

const REF_COLOR = 'rgba(120, 113, 108, 0.35)'
const SPINE_COLOR = 'rgba(120, 113, 108, 0.18)'

export function colorForThoughtType(thoughtType: string): string {
  return TYPE_COLORS[thoughtType] ?? '#78716c'
}

export function colorForRelation(kind: RelationKind): string {
  return RELATION_COLORS[kind] ?? '#a8a29e'
}

function firstLineTitle(content: string): string {
  const line =
    content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? 'Untitled'
  return line
    .replace(/^#+\s*/, '')
    .replace(/^\*+\s*/, '')
    .replace(/\*+$/, '')
    .slice(0, 72)
}

export function nodeLabel(thought: Thought): string {
  return `#${thought.index} · ${thought.thought_type}`
}

export function buildGraph(
  thoughts: Thought[],
  toggles: EdgeToggles,
): GraphData {
  const byId = new Map<string, Thought>()
  const byChainIndex = new Map<string, Thought>()
  const byHash = new Map<string, Thought>()

  for (const thought of thoughts) {
    byId.set(thought.id, thought)
    byChainIndex.set(`${thought.chain_key ?? ''}::${thought.index}`, thought)
    if (thought.hash) {
      byHash.set(thought.hash, thought)
    }
  }

  const links: GraphLink[] = []
  const seen = new Set<string>()
  const degree = new Map<string, number>()

  const bump = (id: string) => {
    degree.set(id, (degree.get(id) ?? 0) + 1)
  }

  const pushLink = (link: GraphLink) => {
    if (seen.has(link.id)) return
    if (!byId.has(link.source) || !byId.has(link.target)) return
    seen.add(link.id)
    links.push(link)
    bump(link.source)
    bump(link.target)
  }

  for (const thought of thoughts) {
    const chainKey = thought.chain_key ?? ''

    if (toggles.relations) {
      for (const rel of thought.relations ?? []) {
        if (!rel.target_id) continue
        pushLink({
          id: `rel:${thought.id}->${rel.target_id}:${rel.kind}`,
          source: thought.id,
          target: rel.target_id,
          kind: 'relation',
          relationKind: rel.kind,
          color: colorForRelation(rel.kind),
          label: rel.kind,
        })
      }
    }

    if (toggles.refs) {
      for (const refIndex of thought.refs ?? []) {
        const target = byChainIndex.get(`${chainKey}::${refIndex}`)
        if (!target) continue
        pushLink({
          id: `ref:${thought.id}->${target.id}`,
          source: thought.id,
          target: target.id,
          kind: 'ref',
          color: REF_COLOR,
          label: `ref #${refIndex}`,
        })
      }
    }

    if (toggles.spine && thought.prev_hash) {
      const prev = byHash.get(thought.prev_hash)
      if (prev) {
        pushLink({
          id: `spine:${prev.id}->${thought.id}`,
          source: prev.id,
          target: thought.id,
          kind: 'spine',
          color: SPINE_COLOR,
          label: 'prev',
        })
      }
    }
  }

  const nodes: GraphNode[] = thoughts.map((thought) => {
    const title = firstLineTitle(thought.content)
    const connections = degree.get(thought.id) ?? 0
    const importance = thought.importance ?? 0.3
    const size = Math.max(3.2, Math.min(14, 3.2 + connections * 0.7 + importance * 3))
    return {
      id: thought.id,
      label: nodeLabel(thought),
      title,
      thoughtType: thought.thought_type,
      chainKey: thought.chain_key ?? '',
      index: thought.index,
      color: colorForThoughtType(thought.thought_type),
      size,
      thought,
    }
  })

  return { nodes, links }
}

export function filterGraph(data: GraphData, opts: GraphFilters): GraphData {
  const query = opts.search.trim().toLowerCase()

  const nodes = data.nodes.filter((node) => {
    const t = node.thought
    if (opts.types && !opts.types.has(node.thoughtType)) {
      return false
    }
    if (opts.chains && !opts.chains.has(t.chain_key || 'unknown')) {
      return false
    }
    if (!query) return true
    return (
      node.label.toLowerCase().includes(query) ||
      node.title.toLowerCase().includes(query) ||
      t.content.toLowerCase().includes(query) ||
      t.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      t.concepts.some((c) => c.toLowerCase().includes(query)) ||
      t.id.toLowerCase().includes(query) ||
      String(t.index).includes(query)
    )
  })

  const ids = new Set(nodes.map((n) => n.id))
  const links = data.links.filter(
    (link) =>
      ids.has(
        typeof link.source === 'string'
          ? link.source
          : (link.source as { id: string }).id,
      ) &&
      ids.has(
        typeof link.target === 'string'
          ? link.target
          : (link.target as { id: string }).id,
      ),
  )

  return { nodes, links }
}

export { TYPE_COLORS, RELATION_COLORS }

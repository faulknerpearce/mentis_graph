import type {
  GraphData,
  GraphFilters,
  GraphLink,
  GraphNode,
  Thought,
  ThoughtStatus,
} from '../types'
import {
  ARCHIVE_THRESHOLD,
  categoryOfRelation,
  CONTESTING_KINDS,
  familyOf,
  RETIRING_KINDS,
} from './taxonomy'
import { thoughtTopics } from './topics'

/** Thoughts by the same agent on the same chain closer than this share a session. */
export const SESSION_GAP_MS = 45 * 60 * 1000

/** `#123` written in the text: an untyped pointer to that index on the same chain. */
const MENTION = /(?<![\w/])#(\d{1,5})\b/g

export function thoughtTitle(content: string): string {
  const line =
    content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? 'Untitled'
  return line
    .replace(/^#+\s*/, '')
    .replace(/^[*_]+|[*_]+$/g, '')
    .slice(0, 96)
}

export function agentOf(thought: Thought): string {
  return thought.agent_name || thought.agent_id
}

function chainScoped(chainKey: string, value: string | number): string {
  return `${chainKey}::${value}`
}

export function nodeSize(degree: number, importance: number | null | undefined, versions = 0): number {
  return Math.min(
    14,
    2.6 + Math.sqrt(degree) * 1.15 + (importance ?? 0.4) * 1.6 + Math.sqrt(versions) * 0.6,
  )
}

function serverStatus(thought: Thought): ThoughtStatus | undefined {
  if (thought.version_status === undefined) return undefined
  if (thought.version_status === 'superseded') return 'retired'
  if (thought.version_status === 'contested') return 'contested'
  return 'live'
}

/** Group each chain+agent stream into bursts of activity. */
function inferSessions(thoughts: Thought[]): Map<string, string> {
  const streams = new Map<string, Thought[]>()
  for (const thought of thoughts) {
    const key = `${thought.chain_key ?? ''}|${agentOf(thought)}`
    const list = streams.get(key) ?? []
    list.push(thought)
    streams.set(key, list)
  }
  const sessions = new Map<string, string>()
  for (const [key, list] of streams) {
    list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    let session = ''
    let last = -Infinity
    for (const thought of list) {
      const time = Date.parse(thought.timestamp) || 0
      if (time - last > SESSION_GAP_MS) session = `${key}|${thought.index}`
      sessions.set(thought.id, session)
      last = time
    }
  }
  return sessions
}

/**
 * Build the full thought network. Every edge is emitted once: positional refs
 * and `#N` mentions are only drawn when no typed relation already links the
 * same pair. Version state comes from MentisDB when the server reports it.
 */
export function buildGraph(thoughts: Thought[]): GraphData {
  const byId = new Map<string, Thought>()
  const byChainIndex = new Map<string, Thought>()
  // Scoped by chain so identical hashes in different chains cannot cross-wire.
  const byHash = new Map<string, Thought>()

  for (const thought of thoughts) {
    const chainKey = thought.chain_key ?? ''
    byId.set(thought.id, thought)
    byChainIndex.set(chainScoped(chainKey, thought.index), thought)
    if (thought.hash) byHash.set(chainScoped(chainKey, thought.hash), thought)
  }

  const links: GraphLink[] = []
  const seen = new Set<string>()
  const linkedPairs = new Set<string>()
  const degree = new Map<string, number>()
  const derivedStatus = new Map<string, ThoughtStatus>()
  const successors = new Map<string, string[]>()
  const retiredBy = new Map<string, string[]>()

  const pushLink = (link: Omit<GraphLink, 'id' | 'color'>) => {
    const id = `${link.category}:${link.source}->${link.target}:${link.kind}`
    if (seen.has(id) || link.source === link.target) return
    if (!byId.has(link.source) || !byId.has(link.target)) return
    seen.add(id)
    links.push({ ...link, id, color: '' })
    if (link.category === 'sequence') return
    linkedPairs.add(`${link.source}->${link.target}`)
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
  }

  const append = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? []
    if (!list.includes(value)) list.push(value)
    map.set(key, list)
  }

  for (const thought of thoughts) {
    for (const rel of thought.relations ?? []) {
      if (!rel.target_id || !byId.has(rel.target_id)) continue
      pushLink({
        source: thought.id,
        target: rel.target_id,
        category: categoryOfRelation(rel.kind),
        kind: rel.kind,
      })
      if (RETIRING_KINDS.has(rel.kind)) {
        derivedStatus.set(rel.target_id, 'retired')
        append(retiredBy, rel.target_id, thought.id)
        append(successors, rel.target_id, thought.id)
      } else if (CONTESTING_KINDS.has(rel.kind)) {
        if (derivedStatus.get(rel.target_id) !== 'retired') {
          derivedStatus.set(rel.target_id, 'contested')
        }
        append(successors, rel.target_id, thought.id)
      }
    }
  }

  for (const thought of thoughts) {
    const chainKey = thought.chain_key ?? ''
    const pointTo = (index: number, kind: string) => {
      const target = byChainIndex.get(chainScoped(chainKey, index))
      if (!target || linkedPairs.has(`${thought.id}->${target.id}`)) return
      pushLink({ source: thought.id, target: target.id, category: 'reference', kind })
    }
    for (const refIndex of thought.refs ?? []) pointTo(refIndex, 'References')
    for (const match of thought.content.matchAll(MENTION)) pointTo(Number(match[1]), 'Mentions')

    if (thought.prev_hash) {
      const prev = byHash.get(chainScoped(chainKey, thought.prev_hash))
      if (prev) {
        pushLink({ source: prev.id, target: thought.id, category: 'sequence', kind: 'Precedes' })
      }
    }
  }

  const archivedCount = new Map<string, number>()
  for (const sources of retiredBy.values()) {
    for (const source of sources) archivedCount.set(source, (archivedCount.get(source) ?? 0) + 1)
  }
  const isArchive = (id: string) => (archivedCount.get(id) ?? 0) > ARCHIVE_THRESHOLD

  // The live thought that now carries a retired one, skipping bulk cleanups.
  const currentOf = (thought: Thought): string | null => {
    const reported = thought.current_version?.thought_id
    if (reported) return isArchive(reported) ? null : reported
    const visited = new Set<string>()
    let id = thought.id
    while (derivedStatus.get(id) === 'retired' && !visited.has(id)) {
      visited.add(id)
      const next = retiredBy.get(id)?.find((s) => !isArchive(s))
      if (!next) return null
      id = next
    }
    return id === thought.id ? null : id
  }

  const sessions = inferSessions(thoughts)
  const statusOf = (t: Thought) => serverStatus(t) ?? derivedStatus.get(t.id) ?? 'live'
  const currentIds = new Map<string, string | null>()
  const versions = new Map<string, string[]>()
  for (const thought of [...thoughts].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    if (statusOf(thought) !== 'retired') continue
    const current = currentOf(thought)
    currentIds.set(thought.id, current)
    if (current) append(versions, current, thought.id)
  }

  const nodes: GraphNode[] = thoughts.map((thought) => {
    const connections = degree.get(thought.id) ?? 0
    const chainKey = thought.chain_key ?? 'unknown'
    return {
      kind: 'thought',
      id: thought.id,
      title: thoughtTitle(thought.content),
      thoughtType: thought.thought_type,
      family: familyOf(thought.thought_type),
      chainKey,
      agent: agentOf(thought),
      index: thought.index,
      time: Date.parse(thought.timestamp) || 0,
      status: statusOf(thought),
      successors:
        thought.successors?.map((s) => s.thought_id).filter((id) => byId.has(id)) ??
        successors.get(thought.id) ??
        [],
      currentId: currentIds.get(thought.id) ?? null,
      versions: versions.get(thought.id) ?? [],
      archived: isArchive(thought.id) ? (archivedCount.get(thought.id) ?? 0) : 0,
      session: sessions.get(thought.id) ?? thought.id,
      topics: thoughtTopics(thought.tags ?? [], thought.concepts ?? [], chainKey),
      degree: connections,
      size: nodeSize(connections, thought.importance),
      color: '',
      thought,
    }
  })

  return { nodes, links }
}

/** Link consecutive visible thoughts within each group, bridging hidden ones. */
function strandLinks(
  nodes: GraphNode[],
  groupOf: (node: GraphNode) => string,
  order: (a: GraphNode, b: GraphNode) => number,
  category: 'sequence' | 'session',
): GraphLink[] {
  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const key = groupOf(node)
    const list = groups.get(key) ?? []
    list.push(node)
    groups.set(key, list)
  }
  const links: GraphLink[] = []
  for (const list of groups.values()) {
    list.sort(order)
    for (let i = 1; i < list.length; i++) {
      const source = list[i - 1].id
      const target = list[i].id
      links.push({
        id: `${category}:${source}->${target}`,
        source,
        target,
        category,
        kind: category === 'session' ? 'SameSession' : 'Precedes',
        color: '',
      })
    }
  }
  return links
}

export function filterGraph(data: GraphData, filters: GraphFilters): GraphData {
  const nodes = data.nodes.filter(
    (node) =>
      (filters.showRetired || node.status !== 'retired') &&
      (!filters.types || filters.types.has(node.thoughtType)) &&
      (!filters.chains || filters.chains.has(node.chainKey)) &&
      (filters.until == null || node.time <= filters.until),
  )
  const ids = new Set(nodes.map((n) => n.id))
  const byId = new Map(data.nodes.map((n) => [n.id, n]))

  // With history hidden, a link to an old version lands on its current version.
  const resolve = (id: string): string | null => {
    if (ids.has(id)) return id
    const current = filters.showRetired ? null : byId.get(id)?.currentId
    return current && ids.has(current) ? current : null
  }

  const links: GraphLink[] = []
  const seen = new Set<string>()
  for (const link of data.links) {
    const category = link.category
    if (category === 'topic' || category === 'sequence' || category === 'session') continue
    if (!filters.edges[category]) continue
    const source = resolve(linkEnd(link.source))
    const target = resolve(linkEnd(link.target))
    if (!source || !target || source === target) continue
    const id = `${category}:${source}->${target}:${link.kind}`
    if (seen.has(id)) continue
    seen.add(id)
    links.push(source === linkEnd(link.source) && target === linkEnd(link.target)
      ? link
      : { ...link, id, source, target })
  }
  if (filters.edges.session) {
    links.push(...strandLinks(nodes, (n) => n.session, (a, b) => a.time - b.time, 'session'))
  }
  if (filters.edges.sequence) {
    links.push(...strandLinks(nodes, (n) => n.chainKey, (a, b) => a.index - b.index, 'sequence'))
  }

  // Size by visible connections so hubs whose links are all hidden shrink.
  const degree = new Map<string, number>()
  for (const link of links) {
    if (link.category === 'sequence' || link.category === 'session') continue
    for (const end of [linkEnd(link.source), linkEnd(link.target)]) {
      degree.set(end, (degree.get(end) ?? 0) + 1)
    }
  }
  const sized = nodes.map((node) => ({
    ...node,
    size: nodeSize(
      degree.get(node.id) ?? 0,
      node.thought.importance,
      filters.showRetired ? 0 : node.versions.length,
    ),
  }))

  return { nodes: sized, links }
}

/** Nodes whose text or metadata matches `query`; null for an empty query. */
export function searchNodes(nodes: GraphNode[], query: string): GraphNode[] | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const indexQuery = q.replace(/^#/, '')
  return nodes.filter((node) => {
    const t = node.thought
    return (
      String(node.index) === indexQuery ||
      node.title.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      t.concepts.some((c) => c.toLowerCase().includes(q)) ||
      t.id.toLowerCase().startsWith(q)
    )
  })
}

/** Library code swaps link endpoints for node objects once the simulation runs. */
export function linkEnd(ref: string | { id?: string } | undefined): string {
  if (typeof ref === 'string') return ref
  return ref?.id ?? ''
}

/** Neighbor id set for selection highlighting (includes the selected node). */
export function neighborIdsFor(
  selectedId: string | null,
  links: GraphLink[],
): Set<string> | null {
  if (!selectedId) return null
  const ids = new Set<string>([selectedId])
  for (const link of links) {
    const source = linkEnd(link.source)
    const target = linkEnd(link.target)
    if (source === selectedId) ids.add(target)
    if (target === selectedId) ids.add(source)
  }
  return ids
}

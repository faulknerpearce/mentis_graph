import type { GraphData, GraphLink, GraphNode, MapData, TopicNode } from '../types'

const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
const NOISE = new RegExp(
  [
    '^\\d', // dates, versions, bare numbers
    `^${MONTH}-\\d{4}$`,
    ':', // key:value stamps such as verified:2026-11-07
    '^.{0,2}$',
  ].join('|'),
)

/** Tags that restate the thought type or are housekeeping, not subject matter. */
const GENERIC = new Set([
  'aseryx', 'checkpoint', 'summary', 'decision', 'decisions', 'lesson', 'lessons',
  'lesson-learned', 'correction', 'corrections', 'task-complete', 'constraint',
  'insight', 'finding', 'mistake', 'plan', 'handoff', 'session', 'memory',
  'state-snapshot', 'canonical', 'cleanup', 'superseded-memories', 'superseded',
])

const PREFIX = /^aseryx[-_]/

export function normalizeTopic(raw: string): string | null {
  const topic = raw.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(PREFIX, '')
  if (NOISE.test(topic) || GENERIC.has(topic)) return null
  return topic
}

/**
 * Topics of one thought. Its own chain's name is skipped: every thought in a
 * repo chain is "about" that repo, so it would only rebuild the chain grouping.
 */
export function thoughtTopics(tags: string[], concepts: string[], chainKey: string): string[] {
  const own = chainKey.replace(PREFIX, '')
  const topics = new Set<string>()
  for (const raw of [...concepts, ...tags]) {
    const topic = normalizeTopic(raw)
    if (topic && topic !== own) topics.add(topic)
  }
  return [...topics]
}

export interface TopicIndex {
  /** Chosen topic -> number of live thoughts carrying it. */
  counts: Map<string, number>
  /** Thought id -> the topics it hangs from, most specific first. */
  byThought: Map<string, string[]>
}

export interface TopicOptions {
  maxTopics: number
  minCount: number
  /** Topics on more than this share of thoughts are too broad to cluster by. */
  maxShare: number
  perThought: number
}

const DEFAULTS: TopicOptions = { maxTopics: 70, minCount: 5, maxShare: 0.15, perThought: 1 }

/**
 * Choose the topics that make good hubs (common enough to gather a cluster,
 * specific enough to mean something) and attach each thought to its most
 * specific ones. Counts come from live thoughts, so history does not decide
 * what the current memory is about.
 */
export function buildTopicIndex(
  nodes: GraphNode[],
  options: Partial<TopicOptions> = {},
): TopicIndex {
  const { maxTopics, minCount, maxShare, perThought } = { ...DEFAULTS, ...options }
  const live = nodes.filter((n) => n.status !== 'retired')
  const frequency = new Map<string, number>()
  for (const node of live) {
    for (const topic of node.topics) frequency.set(topic, (frequency.get(topic) ?? 0) + 1)
  }

  const ceiling = Math.max(minCount, live.length * maxShare)
  const counts = new Map(
    [...frequency.entries()]
      .filter(([, count]) => count >= minCount && count <= ceiling)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxTopics),
  )

  const byThought = new Map<string, string[]>()
  for (const node of nodes) {
    const chosen = node.topics
      .filter((topic) => counts.has(topic))
      .sort((a, b) => counts.get(a)! - counts.get(b)! || a.localeCompare(b))
      .slice(0, perThought)
    if (chosen.length > 0) byThought.set(node.id, chosen)
  }

  return { counts, byThought }
}

export const topicNodeId = (topic: string) => `topic:${topic}`

/** Add topic hubs (only those with visible members) and membership links. */
export function withTopics(data: GraphData, index: TopicIndex): MapData {
  const members = new Map<string, GraphNode[]>()
  const links: GraphLink[] = []
  for (const node of data.nodes) {
    for (const topic of index.byThought.get(node.id) ?? []) {
      const list = members.get(topic) ?? []
      list.push(node)
      members.set(topic, list)
      links.push({
        id: `topic:${node.id}->${topic}`,
        source: node.id,
        target: topicNodeId(topic),
        category: 'topic',
        kind: 'About',
        color: '',
      })
    }
  }

  const topics: TopicNode[] = [...members.entries()].map(([topic, list]) => ({
    kind: 'topic',
    id: topicNodeId(topic),
    title: topic,
    count: list.length,
    chains: [...new Set(list.map((n) => n.chainKey))],
    size: 5 + Math.sqrt(list.length) * 1.6,
    color: '',
  }))

  return { nodes: [...data.nodes, ...topics], links: [...data.links, ...links] }
}

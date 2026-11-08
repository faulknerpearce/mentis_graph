import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  filterGraph,
  neighborIdsFor,
  searchNodes,
  thoughtTitle,
} from './buildGraph'
import { buildTopicIndex, normalizeTopic, thoughtTopics, withTopics } from './topics'
import { toggleFacet } from '../lib/facets'
import type { GraphFilters, GraphLink, Thought } from '../types'

function thought(partial: Partial<Thought> & Pick<Thought, 'id' | 'index'>): Thought {
  return {
    hash: partial.hash ?? `h-${partial.id}`,
    prev_hash: partial.prev_hash ?? '',
    content: partial.content ?? `# Thought ${partial.index}`,
    thought_type: partial.thought_type ?? 'Decision',
    role: partial.role ?? 'Memory',
    tags: partial.tags ?? [],
    concepts: partial.concepts ?? [],
    refs: partial.refs ?? [],
    relations: partial.relations ?? [],
    agent_id: partial.agent_id ?? 'agent-1',
    timestamp: partial.timestamp ?? '2026-01-01T00:00:00Z',
    chain_key: partial.chain_key ?? 'main',
    ...partial,
  }
}

const SHOW_ALL: GraphFilters = {
  edges: { lineage: true, reasoning: true, reference: true, session: true, sequence: true },
  showRetired: true,
  types: null,
  chains: null,
  until: null,
}

function link(id: string, source: string, target: string): GraphLink {
  return { id, source, target, category: 'reference', kind: 'References', color: '' }
}

describe('thoughtTitle', () => {
  it('uses the first non-empty line without markdown markers', () => {
    expect(thoughtTitle('\n## **Decision**: ship it\nbody')).toBe('Decision**: ship it')
    expect(thoughtTitle('   ')).toBe('Untitled')
  })
})

describe('buildGraph', () => {
  it('draws a ref once when a References relation already covers it', () => {
    const graph = buildGraph([
      thought({ id: 't0', index: 0, hash: 'hash0' }),
      thought({
        id: 't1',
        index: 1,
        prev_hash: 'hash0',
        refs: [0],
        relations: [{ kind: 'References', target_id: 't0' }],
      }),
    ])
    expect(graph.links.map((l) => `${l.category}:${l.kind}`).sort()).toEqual([
      'reference:References',
      'sequence:Precedes',
    ])
  })

  it('keeps bare positional refs that have no relation', () => {
    const graph = buildGraph([
      thought({ id: 't0', index: 0 }),
      thought({ id: 't1', index: 1, refs: [0] }),
    ])
    expect(graph.links).toEqual([
      expect.objectContaining({ source: 't1', target: 't0', category: 'reference' }),
    ])
  })

  it('categorises relations and derives memory status', () => {
    const graph = buildGraph([
      thought({ id: 'old', index: 0 }),
      thought({ id: 'doubted', index: 1 }),
      thought({ id: 'base', index: 2 }),
      thought({
        id: 'new',
        index: 3,
        relations: [
          { kind: 'Supersedes', target_id: 'old' },
          { kind: 'Contradicts', target_id: 'doubted' },
          { kind: 'DerivedFrom', target_id: 'base' },
        ],
      }),
    ])
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    expect(byId.get('old')).toMatchObject({ status: 'retired', successors: ['new'] })
    expect(byId.get('doubted')?.status).toBe('contested')
    expect(byId.get('base')?.status).toBe('live')
    expect(byId.get('new')?.degree).toBe(3)
    expect(graph.links.map((l) => l.category).sort()).toEqual([
      'lineage',
      'lineage',
      'reasoning',
    ])
  })

  it('does not count sequence edges towards degree', () => {
    const graph = buildGraph([
      thought({ id: 'a0', index: 0, hash: 'x' }),
      thought({ id: 'a1', index: 1, prev_hash: 'x' }),
    ])
    expect(graph.nodes.map((n) => n.degree)).toEqual([0, 0])
  })

  it('does not cross-wire sequence edges across chains with the same hash', () => {
    const graph = buildGraph([
      thought({ id: 'a0', index: 0, chain_key: 'alpha', hash: 'shared' }),
      thought({ id: 'b1', index: 1, chain_key: 'beta', prev_hash: 'shared' }),
    ])
    expect(graph.links).toHaveLength(0)
  })
})

describe('filterGraph', () => {
  const base = buildGraph([
    thought({ id: 'old', index: 0, timestamp: '2026-01-01T00:00:00Z' }),
    thought({
      id: 'new',
      index: 1,
      chain_key: 'beta',
      thought_type: 'Question',
      timestamp: '2026-03-01T00:00:00Z',
      relations: [{ kind: 'Supersedes', target_id: 'old' }],
    }),
  ])

  it('hides retired thoughts and their edges unless asked', () => {
    const hidden = filterGraph(base, { ...SHOW_ALL, showRetired: false })
    expect(hidden.nodes.map((n) => n.id)).toEqual(['new'])
    expect(hidden.links).toHaveLength(0)
    expect(filterGraph(base, SHOW_ALL).links).toHaveLength(1)
  })

  it('filters edges by category', () => {
    const noLineage = filterGraph(base, {
      ...SHOW_ALL,
      edges: { ...SHOW_ALL.edges, lineage: false },
    })
    expect(noLineage.nodes).toHaveLength(2)
    expect(noLineage.links).toHaveLength(0)
  })

  it('filters by type, chain and time', () => {
    const ids = (f: Partial<GraphFilters>) =>
      filterGraph(base, { ...SHOW_ALL, ...f }).nodes.map((n) => n.id)
    expect(ids({ types: new Set(['Question']) })).toEqual(['new'])
    expect(ids({ chains: new Set(['main']) })).toEqual(['old'])
    expect(ids({ until: Date.parse('2026-02-01T00:00:00Z') })).toEqual(['old'])
  })
})

describe('versions, mentions and sessions', () => {
  it('prefers the version state reported by MentisDB', () => {
    const graph = buildGraph([
      thought({ id: 'a', index: 0, version_status: 'contested' }),
      thought({ id: 'b', index: 1, version_status: null }),
    ])
    expect(graph.nodes.map((n) => n.status)).toEqual(['contested', 'live'])
  })

  it('folds retired thoughts into their current version and redirects links', () => {
    const graph = buildGraph([
      thought({ id: 'v1', index: 0, timestamp: '2026-01-01T00:00:00Z' }),
      thought({
        id: 'v2',
        index: 1,
        timestamp: '2026-01-02T00:00:00Z',
        relations: [{ kind: 'Supersedes', target_id: 'v1' }],
      }),
      thought({
        id: 'reader',
        index: 2,
        timestamp: '2026-03-01T00:00:00Z',
        relations: [{ kind: 'DerivedFrom', target_id: 'v1' }],
      }),
    ])
    const v2 = graph.nodes.find((n) => n.id === 'v2')
    expect(v2?.versions).toEqual(['v1'])
    expect(graph.nodes.find((n) => n.id === 'v1')?.currentId).toBe('v2')

    const live = filterGraph(graph, { ...SHOW_ALL, showRetired: false, edges: { ...SHOW_ALL.edges, session: false, sequence: false } })
    expect(live.links.map((l) => `${l.source}->${l.target}:${l.kind}`)).toEqual(['reader->v2:DerivedFrom'])
  })

  it('does not treat a bulk cleanup as the current version', () => {
    const old = Array.from({ length: 10 }, (_, i) => thought({ id: `o${i}`, index: i }))
    const cleanup = thought({
      id: 'cleanup',
      index: 10,
      relations: old.map((o) => ({ kind: 'Supersedes', target_id: o.id })),
    })
    const graph = buildGraph([...old, cleanup])
    expect(graph.nodes.find((n) => n.id === 'cleanup')).toMatchObject({ archived: 10, versions: [] })
    expect(graph.nodes.find((n) => n.id === 'o0')?.currentId).toBeNull()
  })

  it('links #N mentions in the text unless a relation already does', () => {
    const graph = buildGraph([
      thought({ id: 'a', index: 7 }),
      thought({ id: 'b', index: 8 }),
      thought({
        id: 'c',
        index: 9,
        content: 'Builds on #7 and #8, see also #404',
        relations: [{ kind: 'Supports', target_id: 'b' }],
      }),
    ])
    expect(graph.links.map((l) => `${l.target}:${l.kind}`).sort()).toEqual(['a:Mentions', 'b:Supports'])
  })

  it('groups bursts of work by the same agent into sessions', () => {
    const graph = buildGraph([
      thought({ id: 'a', index: 0, timestamp: '2026-01-01T10:00:00Z' }),
      thought({ id: 'b', index: 1, timestamp: '2026-01-01T10:20:00Z' }),
      thought({ id: 'c', index: 2, timestamp: '2026-01-01T15:00:00Z' }),
      thought({ id: 'd', index: 3, timestamp: '2026-01-01T10:10:00Z', agent_id: 'other' }),
    ])
    const session = new Map(graph.nodes.map((n) => [n.id, n.session]))
    expect(session.get('a')).toBe(session.get('b'))
    expect(session.get('c')).not.toBe(session.get('a'))
    expect(session.get('d')).not.toBe(session.get('a'))
    const strands = filterGraph(graph, SHOW_ALL).links.filter((l) => l.category === 'session')
    expect(strands.map((l) => `${l.source}->${l.target}`)).toEqual(['a->b'])
  })
})

describe('topics', () => {
  it('normalises tags and drops dates, stamps and generic labels', () => {
    expect(normalizeTopic('Lit Protocol')).toBe('lit-protocol')
    expect(normalizeTopic('aseryx_zk_server')).toBe('zk-server')
    expect(normalizeTopic('2026-09-08')).toBeNull()
    expect(normalizeTopic('july-2026')).toBeNull()
    expect(normalizeTopic('verified:2026-11-07')).toBeNull()
    expect(normalizeTopic('checkpoint')).toBeNull()
  })

  it("skips the thought's own chain name", () => {
    expect(thoughtTopics(['zk-server', 'custody'], [], 'aseryx-zk-server')).toEqual(['custody'])
  })

  it('attaches thoughts to their most specific topics and builds hubs', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      thought({ id: `t${i}`, index: i, tags: i < 3 ? ['escrow', 'custody'] : ['custody'] }),
    )
    const graph = buildGraph(many)
    const index = buildTopicIndex(graph.nodes, { minCount: 2, maxShare: 1, perThought: 1 })
    expect(index.byThought.get('t0')).toEqual(['escrow'])
    expect(index.byThought.get('t5')).toEqual(['custody'])

    const map = withTopics(graph, index)
    const hubs = map.nodes.filter((n) => n.kind === 'topic')
    expect(hubs.map((h) => [h.title, h.kind === 'topic' && h.count])).toEqual([
      ['escrow', 3],
      ['custody', 3],
    ])
    expect(map.links.filter((l) => l.category === 'topic')).toHaveLength(6)
  })
})

describe('sequence strands', () => {
  it('bridges over hidden thoughts so a chain stays one strand', () => {
    const graph = buildGraph([
      thought({ id: 'a', index: 0, hash: 'ha' }),
      thought({ id: 'b', index: 1, hash: 'hb', prev_hash: 'ha' }),
      thought({
        id: 'c',
        index: 2,
        prev_hash: 'hb',
        relations: [{ kind: 'Supersedes', target_id: 'b' }],
      }),
      thought({ id: 'x', index: 0, chain_key: 'other' }),
    ])
    const strands = filterGraph(graph, { ...SHOW_ALL, showRetired: false }).links.filter(
      (l) => l.category === 'sequence',
    )
    expect(strands.map((l) => `${l.source}->${l.target}`)).toEqual(['a->c'])
  })
})

describe('searchNodes', () => {
  const { nodes } = buildGraph([
    thought({ id: 'd1', index: 12, content: 'Ship the feature', tags: ['release'] }),
    thought({ id: 'q1', index: 2, content: 'What about rollback?', concepts: ['risk'] }),
  ])

  it('returns null for an empty query', () => {
    expect(searchNodes(nodes, '  ')).toBeNull()
  })

  it('matches content, tags, concepts and #index', () => {
    const ids = (q: string) => searchNodes(nodes, q)?.map((n) => n.id)
    expect(ids('release')).toEqual(['d1'])
    expect(ids('RISK')).toEqual(['q1'])
    expect(ids('#12')).toEqual(['d1'])
  })
})

describe('neighborIdsFor', () => {
  it('returns null when nothing is selected', () => {
    expect(neighborIdsFor(null, [])).toBeNull()
  })

  it('includes the selected node and its neighbours', () => {
    const ids = neighborIdsFor('a', [link('1', 'a', 'b'), link('2', 'c', 'a'), link('3', 'x', 'y')])
    expect(ids).toEqual(new Set(['a', 'b', 'c']))
  })
})

describe('toggleFacet', () => {
  const all = ['a', 'b', 'c']

  it('deselects from the implicit all-selected state', () => {
    expect(toggleFacet(null, ['a'], all)).toEqual(new Set(['b', 'c']))
  })

  it('returns null once everything is selected again', () => {
    expect(toggleFacet(new Set(['b', 'c']), ['a'], all)).toBeNull()
  })

  it('toggles a group as one unit', () => {
    expect(toggleFacet(new Set(['a']), ['a', 'b'], all)).toEqual(new Set(['a', 'b']))
    expect(toggleFacet(null, ['a', 'b'], all)).toEqual(new Set(['c']))
  })
})

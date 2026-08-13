import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  filterGraph,
  neighborIdsFor,
  nodeLabel,
} from './buildGraph'
import type { EdgeToggles, Thought } from '../types'

function thought(partial: Partial<Thought> & Pick<Thought, 'id' | 'index'>): Thought {
  return {
    hash: partial.hash ?? `h-${partial.id}`,
    prev_hash: partial.prev_hash ?? '',
    content: partial.content ?? `# Thought ${partial.index}`,
    thought_type: partial.thought_type ?? 'Decision',
    role: partial.role ?? 'agent',
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

const ALL_EDGES: EdgeToggles = {
  relations: true,
  refs: true,
  spine: true,
}

describe('nodeLabel', () => {
  it('formats index and type', () => {
    expect(nodeLabel(thought({ id: 'a', index: 3, thought_type: 'Plan' }))).toBe(
      '#3 · Plan',
    )
  })
})

describe('buildGraph', () => {
  it('builds relation, ref, and spine edges', () => {
    const thoughts = [
      thought({
        id: 't0',
        index: 0,
        hash: 'hash0',
        content: 'Genesis',
      }),
      thought({
        id: 't1',
        index: 1,
        hash: 'hash1',
        prev_hash: 'hash0',
        refs: [0],
        relations: [{ kind: 'DerivedFrom', target_id: 't0' }],
        content: 'Child',
      }),
    ]

    const graph = buildGraph(thoughts, ALL_EDGES)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.links.map((l) => l.kind).sort()).toEqual([
      'ref',
      'relation',
      'spine',
    ])
  })

  it('does not cross-wire spine edges across chains with the same hash', () => {
    const thoughts = [
      thought({
        id: 'a0',
        index: 0,
        chain_key: 'alpha',
        hash: 'shared',
        content: 'Alpha genesis',
      }),
      thought({
        id: 'b0',
        index: 0,
        chain_key: 'beta',
        hash: 'other',
        content: 'Beta genesis',
      }),
      thought({
        id: 'b1',
        index: 1,
        chain_key: 'beta',
        hash: 'beta1',
        prev_hash: 'shared',
        content: 'Should not attach to alpha',
      }),
    ]

    const graph = buildGraph(thoughts, {
      relations: false,
      refs: false,
      spine: true,
    })
    expect(graph.links.filter((l) => l.kind === 'spine')).toHaveLength(0)
  })

  it('scopes spine edges within a chain', () => {
    const thoughts = [
      thought({
        id: 'a0',
        index: 0,
        chain_key: 'alpha',
        hash: 'a-hash',
      }),
      thought({
        id: 'a1',
        index: 1,
        chain_key: 'alpha',
        hash: 'a-hash-1',
        prev_hash: 'a-hash',
      }),
    ]
    const graph = buildGraph(thoughts, {
      relations: false,
      refs: false,
      spine: true,
    })
    expect(graph.links).toHaveLength(1)
    expect(graph.links[0]).toMatchObject({
      kind: 'spine',
      source: 'a0',
      target: 'a1',
    })
  })
})

describe('filterGraph', () => {
  const base = buildGraph(
    [
      thought({
        id: 'd1',
        index: 1,
        thought_type: 'Decision',
        content: 'Ship the feature',
        tags: ['release'],
      }),
      thought({
        id: 'q1',
        index: 2,
        thought_type: 'Question',
        content: 'What about rollback?',
        concepts: ['risk'],
      }),
    ],
    ALL_EDGES,
  )

  it('filters by thought type', () => {
    const filtered = filterGraph(base, {
      thoughtTypes: new Set(['Question']),
      search: '',
    })
    expect(filtered.nodes.map((n) => n.id)).toEqual(['q1'])
  })

  it('filters by search across content and tags', () => {
    const filtered = filterGraph(base, {
      thoughtTypes: null,
      search: 'release',
    })
    expect(filtered.nodes.map((n) => n.id)).toEqual(['d1'])
  })
})

describe('neighborIdsFor', () => {
  it('returns null when nothing is selected', () => {
    expect(neighborIdsFor(null, [])).toBeNull()
  })

  it('includes the selected node and its neighbors', () => {
    const ids = neighborIdsFor('a', [
      {
        id: '1',
        source: 'a',
        target: 'b',
        kind: 'relation',
        color: '',
        label: 'DerivedFrom',
      },
      {
        id: '2',
        source: 'c',
        target: 'a',
        kind: 'ref',
        color: '',
        label: 'ref',
      },
      {
        id: '3',
        source: 'x',
        target: 'y',
        kind: 'spine',
        color: '',
        label: 'prev',
      },
    ])
    expect(ids).toEqual(new Set(['a', 'b', 'c']))
  })
})

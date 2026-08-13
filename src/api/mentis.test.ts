import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadChainThoughts } from './mentis'
import type { TraverseResponse } from '../types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function page(
  partial: Partial<TraverseResponse> & Pick<TraverseResponse, 'thoughts'>,
): TraverseResponse {
  return {
    chain_key: 'main',
    direction: 'forward',
    include_anchor: false,
    chunk_size: 200,
    has_more: false,
    next_cursor: null,
    previous_cursor: null,
    ...partial,
  }
}

describe('loadChainThoughts', () => {
  it('pages until has_more is false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            page({
              thoughts: [
                {
                  id: 't0',
                  index: 0,
                  hash: 'h0',
                  prev_hash: '',
                  content: 'one',
                  thought_type: 'Decision',
                  role: 'agent',
                  tags: [],
                  concepts: [],
                  refs: [],
                  relations: [],
                  agent_id: 'a',
                  timestamp: '2026-01-01T00:00:00Z',
                },
              ],
              has_more: true,
              next_cursor: { id: 't0', index: 0, hash: 'h0' },
              include_anchor: true,
            }),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            page({
              thoughts: [
                {
                  id: 't1',
                  index: 1,
                  hash: 'h1',
                  prev_hash: 'h0',
                  content: 'two',
                  thought_type: 'Plan',
                  role: 'agent',
                  tags: [],
                  concepts: [],
                  refs: [],
                  relations: [],
                  agent_id: 'a',
                  timestamp: '2026-01-01T00:00:01Z',
                },
              ],
              has_more: false,
            }),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    vi.stubGlobal('fetch', fetchMock)

    const thoughts = await loadChainThoughts('main')
    expect(thoughts.map((t) => t.id)).toEqual(['t0', 't1'])
    expect(thoughts.every((t) => t.chain_key === 'main')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops early when cancelled', async () => {
    const thoughtPayload = page({
      thoughts: [
        {
          id: 't0',
          index: 0,
          hash: 'h0',
          prev_hash: '',
          content: 'one',
          thought_type: 'Decision',
          role: 'agent',
          tags: [],
          concepts: [],
          refs: [],
          relations: [],
          agent_id: 'a',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
      has_more: true,
      next_cursor: { id: 't0', index: 0, hash: 'h0' },
    })
    const fetchMock = vi.fn().mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify(thoughtPayload), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    let iterations = 0
    const thoughts = await loadChainThoughts(
      'main',
      undefined,
      () => ++iterations > 1,
    )
    expect(thoughts.map((t) => t.id)).toEqual(['t0'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

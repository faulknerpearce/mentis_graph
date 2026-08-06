import type { ChainsResponse, Thought, TraverseResponse } from '../types'

const API_BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `MentisDB ${path} failed (${response.status}): ${body || response.statusText}`,
    )
  }

  return response.json() as Promise<T>
}

export async function listChains(): Promise<ChainsResponse> {
  return request<ChainsResponse>('/v1/chains')
}

export async function traverseChunk(params: {
  chain_key: string
  chunk_size?: number
  anchor_boundary?: 'genesis' | 'head'
  anchor_index?: number
  anchor_id?: string
  include_anchor?: boolean
}): Promise<TraverseResponse> {
  return request<TraverseResponse>('/v1/thoughts/traverse', {
    method: 'POST',
    body: JSON.stringify({
      chain_key: params.chain_key,
      direction: 'forward',
      chunk_size: params.chunk_size ?? 200,
      include_anchor: params.include_anchor ?? false,
      ...(params.anchor_boundary
        ? { anchor_boundary: params.anchor_boundary }
        : {}),
      ...(params.anchor_index !== undefined
        ? { anchor_index: params.anchor_index }
        : {}),
      ...(params.anchor_id ? { anchor_id: params.anchor_id } : {}),
    }),
  })
}

/** Page through an entire chain from genesis to head. */
export async function loadChainThoughts(
  chainKey: string,
  onProgress?: (loaded: number, chainKey: string) => void,
): Promise<Thought[]> {
  const thoughts: Thought[] = []
  let page = await traverseChunk({
    chain_key: chainKey,
    anchor_boundary: 'genesis',
    include_anchor: true,
    chunk_size: 200,
  })

  while (true) {
    for (const thought of page.thoughts) {
      thoughts.push({ ...thought, chain_key: chainKey })
    }
    onProgress?.(thoughts.length, chainKey)

    if (!page.has_more || !page.next_cursor) {
      break
    }

    page = await traverseChunk({
      chain_key: chainKey,
      anchor_id: page.next_cursor.id,
      include_anchor: false,
      chunk_size: 200,
    })
  }

  return thoughts
}

export async function loadThoughtsForChains(
  chainKeys: string[],
  onProgress?: (loaded: number, chainKey: string) => void,
): Promise<Thought[]> {
  const all: Thought[] = []
  for (const key of chainKeys) {
    const chunk = await loadChainThoughts(key, onProgress)
    all.push(...chunk)
  }
  return all
}

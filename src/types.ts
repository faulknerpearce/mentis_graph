export type RelationKind =
  | 'CausedBy'
  | 'Corrects'
  | 'Invalidates'
  | 'Supersedes'
  | 'DerivedFrom'
  | 'Summarizes'
  | 'References'
  | 'Supports'
  | 'ContinuesFrom'
  | 'BranchesFrom'
  | string

export interface ThoughtRelation {
  kind: RelationKind
  target_id: string
  chain_key?: string | null
  valid_at?: string | null
}

export interface Thought {
  id: string
  index: number
  hash: string
  prev_hash: string
  content: string
  thought_type: string
  role: string
  tags: string[]
  concepts: string[]
  refs: number[]
  relations: ThoughtRelation[]
  agent_id: string
  agent_name?: string | null
  agent_owner?: string | null
  importance?: number | null
  confidence?: number | null
  entity_type?: string | null
  timestamp: string
  chain_key?: string
}

export interface ChainInfo {
  chain_key: string
  version: number
  storage_adapter: string
  thought_count: number
  agent_count: number
  storage_location: string
}

export interface ChainsResponse {
  default_chain_key: string
  chain_keys: string[]
  chains: ChainInfo[]
}

export interface TraversalCursor {
  id: string
  index: number
  hash: string
}

export interface TraverseResponse {
  chain_key: string
  direction: string
  include_anchor: boolean
  chunk_size: number
  thoughts: Thought[]
  has_more: boolean
  next_cursor: TraversalCursor | null
  previous_cursor: TraversalCursor | null
}

export type EdgeKind = 'relation' | 'ref' | 'spine'

export interface GraphNode {
  id: string
  label: string
  title: string
  thoughtType: string
  chainKey: string
  index: number
  color: string
  /** Visual radius weight (connection/importance hub size). */
  size: number
  thought: Thought
}

export interface GraphLink {
  id: string
  source: string
  target: string
  kind: EdgeKind
  relationKind?: RelationKind
  color: string
  label: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export type GraphMode = '2d' | '3d'

export interface EdgeToggles {
  relations: boolean
  refs: boolean
  spine: boolean
}

export interface FacetOption {
  value: string
  label: string
  count: number
  color?: string
}

export interface GraphFilters {
  types: Set<string> | null
  chains: Set<string> | null
  search: string
}

export type RelationKind =
  | 'References'
  | 'Summarizes'
  | 'Corrects'
  | 'Invalidates'
  | 'CausedBy'
  | 'Supports'
  | 'Contradicts'
  | 'DerivedFrom'
  | 'ContinuesFrom'
  | 'BranchesFrom'
  | 'RelatedTo'
  | 'Supersedes'
  | string

export interface ThoughtRelation {
  kind: RelationKind
  target_id: string
  chain_key?: string | null
  valid_at?: string | null
}

/** A successor as reported by MentisDB's version tracking. */
export interface SuccessorRef {
  thought_id: string
  index: number
  kind: string
  thought_type?: string
  timestamp?: string
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
  /** Server-computed version state; null for live thoughts, absent on older servers. */
  version_status?: 'superseded' | 'contested' | string | null
  current_version?: SuccessorRef | null
  successors?: SuccessorRef[] | null
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

/**
 * Semantic edge families:
 * - lineage: how memory evolved (Supersedes, Corrects, Invalidates, Contradicts)
 * - reasoning: typed links between ideas (DerivedFrom, Supports, CausedBy, …)
 * - reference: plain back-references (References relations and positional refs)
 * - session: consecutive thoughts from one working session
 * - sequence: append order within a chain (prev_hash)
 * - topic: thought-to-topic membership in the topic map (not user-toggleable)
 */
export type EdgeCategory =
  | 'lineage'
  | 'reasoning'
  | 'reference'
  | 'session'
  | 'sequence'
  | 'topic'
export type RelationCategory = Exclude<EdgeCategory, 'topic'>

/**
 * - live: returned by default MentisDB retrieval
 * - contested: a newer thought contradicts it, but it stays visible
 * - retired: superseded, corrected or invalidated, so hidden from retrieval
 */
export type ThoughtStatus = 'live' | 'contested' | 'retired'

export type ColorMode = 'type' | 'chain' | 'agent'

export interface GraphNode {
  kind: 'thought'
  id: string
  title: string
  thoughtType: string
  family: string
  chainKey: string
  agent: string
  index: number
  time: number
  status: ThoughtStatus
  /** Ids of the thoughts that retired or contested this one. */
  successors: string[]
  /** For a retired thought: the live thought that now carries it, if any. */
  currentId: string | null
  /** Earlier versions this thought replaced, newest first (transitive). */
  versions: string[]
  /** How many thoughts this one retired in bulk (a cleanup / archive event). */
  archived: number
  /** Inferred working session: same chain and agent, written in one burst. */
  session: string
  /** Normalised topics drawn from tags and concepts. */
  topics: string[]
  degree: number
  /** Visual radius in graph units. */
  size: number
  color: string
  thought: Thought
}

export interface GraphLink {
  id: string
  source: string
  target: string
  category: EdgeCategory
  /** Relation kind, or 'Precedes' for sequence edges. */
  kind: string
  color: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface TopicNode {
  kind: 'topic'
  id: string
  title: string
  /** Visible member thoughts. */
  count: number
  chains: string[]
  size: number
  color: string
}

export type MapNode = GraphNode | TopicNode

export interface MapData {
  nodes: MapNode[]
  links: GraphLink[]
}

export type GraphMode = '2d' | '3d'

export type LayoutMode = 'topics' | 'chains'

export type EdgeToggles = Record<RelationCategory, boolean>

export interface FacetOption {
  value: string
  label: string
  count: number
  color?: string
}

export interface GraphFilters {
  edges: EdgeToggles
  showRetired: boolean
  types: Set<string> | null
  chains: Set<string> | null
  /** Hide thoughts recorded after this epoch ms; null shows everything. */
  until: number | null
}

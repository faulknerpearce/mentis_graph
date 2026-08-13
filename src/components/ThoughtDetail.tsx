import { useEffect, useState } from 'react'
import type { GraphLink, GraphNode, Thought } from '../types'

interface ThoughtDetailProps {
  node: GraphNode | null
  links: GraphLink[]
  nodesById: Map<string, GraphNode>
  onSelectNeighbor: (id: string) => void
  onClose: () => void
}

export function ThoughtDetail({
  node,
  links,
  nodesById,
  onSelectNeighbor,
  onClose,
}: ThoughtDetailProps) {
  const open = Boolean(node)
  // Keep last selected thought visible while the panel slides closed.
  const [displayNode, setDisplayNode] = useState<GraphNode | null>(node)

  useEffect(() => {
    if (node) {
      setDisplayNode(node)
      return
    }

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setDisplayNode(null)
      return
    }

    // Fallback if transitionend never fires (interrupted animation, etc.).
    const timer = window.setTimeout(() => setDisplayNode(null), 320)
    return () => window.clearTimeout(timer)
  }, [node])

  const thought: Thought | null = displayNode?.thought ?? null
  const activeId = displayNode?.id
  const outbound =
    activeId != null
      ? links.filter((l) => resolveId(l.source) === activeId)
      : []
  const inbound =
    activeId != null
      ? links.filter((l) => resolveId(l.target) === activeId)
      : []

  return (
    <aside
      className={`detail-panel${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      inert={!open ? true : undefined}
      onTransitionEnd={(event) => {
        if (event.propertyName !== 'transform') return
        if (!open) setDisplayNode(null)
      }}
    >
      {displayNode && thought ? (
        <div className="detail-panel-inner">
          <div className="detail-header">
            <div>
              <div className="detail-eyebrow">
                {thought.chain_key} · #{thought.index}
              </div>
              <h2>{displayNode.title}</h2>
              <div className="detail-type">{thought.thought_type}</div>
            </div>
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="meta-grid">
            <Meta label="Role" value={thought.role} />
            <Meta
              label="Agent"
              value={thought.agent_name || thought.agent_id}
            />
            <Meta
              label="Importance"
              value={
                thought.importance != null
                  ? thought.importance.toFixed(2)
                  : '—'
              }
            />
            <Meta
              label="Confidence"
              value={
                thought.confidence != null
                  ? thought.confidence.toFixed(2)
                  : '—'
              }
            />
            <Meta
              label="Timestamp"
              value={new Date(thought.timestamp).toLocaleString()}
            />
            <Meta label="Entity" value={thought.entity_type || '—'} />
            <Meta label="ID" value={thought.id} mono />
            <Meta
              label="Hash"
              value={
                thought.hash ? `${thought.hash.slice(0, 16)}…` : '—'
              }
              mono
            />
            <Meta
              label="Prev hash"
              value={
                thought.prev_hash
                  ? `${thought.prev_hash.slice(0, 16)}…`
                  : '—'
              }
              mono
            />
            <Meta label="Owner" value={thought.agent_owner || '—'} />
          </div>

          {(thought.tags.length > 0 || thought.concepts.length > 0) && (
            <div className="tag-block">
              {thought.tags.map((tag) => (
                <span key={`t-${tag}`} className="pill">
                  {tag}
                </span>
              ))}
              {thought.concepts.map((c) => (
                <span key={`c-${c}`} className="pill concept">
                  {c}
                </span>
              ))}
            </div>
          )}

          <NeighborList
            title="Outbound"
            links={outbound}
            nodesById={nodesById}
            selfId={displayNode.id}
            direction="out"
            onSelect={onSelectNeighbor}
          />
          <NeighborList
            title="Inbound"
            links={inbound}
            nodesById={nodesById}
            selfId={displayNode.id}
            direction="in"
            onSelect={onSelectNeighbor}
          />
        </div>
      ) : null}
    </aside>
  )
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="meta-item">
      <span className="meta-label">{label}</span>
      <span className={`meta-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  )
}

function NeighborList({
  title,
  links,
  nodesById,
  selfId,
  direction,
  onSelect,
}: {
  title: string
  links: GraphLink[]
  nodesById: Map<string, GraphNode>
  selfId: string
  direction: 'in' | 'out'
  onSelect: (id: string) => void
}) {
  if (links.length === 0) return null

  return (
    <section>
      <h3>
        {title} ({links.length})
      </h3>
      <ul className="neighbor-list">
        {links.map((link) => {
          const otherId =
            direction === 'out'
              ? resolveId(link.target)
              : resolveId(link.source)
          const other = nodesById.get(otherId)
          return (
            <li key={link.id}>
              <button
                type="button"
                className="neighbor-btn"
                onClick={() => onSelect(otherId)}
                disabled={otherId === selfId}
              >
                <span className="edge-kind">{link.label}</span>
                <span>
                  {other
                    ? `${other.label} — ${other.title}`
                    : otherId.slice(0, 8)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function resolveId(ref: string | { id?: string }): string {
  if (typeof ref === 'string') return ref
  return ref.id ?? ''
}

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
  if (!node) {
    return (
      <aside className="detail-panel empty">
        <p>Click a node to inspect a thought.</p>
      </aside>
    )
  }

  const thought: Thought = node.thought
  const outbound = links.filter((l) => resolveId(l.source) === node.id)
  const inbound = links.filter((l) => resolveId(l.target) === node.id)

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div>
          <div className="detail-eyebrow">
            {thought.chain_key} · #{thought.index}
          </div>
          <h2>{node.title}</h2>
        </div>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="meta-grid">
        <Meta label="Type" value={thought.thought_type} />
        <Meta label="Role" value={thought.role} />
        <Meta label="Agent" value={thought.agent_name || thought.agent_id} />
        <Meta
          label="Importance"
          value={
            thought.importance != null
              ? thought.importance.toFixed(2)
              : '—'
          }
        />
        <Meta
          label="Timestamp"
          value={new Date(thought.timestamp).toLocaleString()}
        />
        <Meta label="ID" value={thought.id} mono />
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

      <section>
        <h3>Content</h3>
        <div className="content-body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {thought.content}
          </ReactMarkdown>
        </div>
      </section>

      <NeighborList
        title="Outbound"
        links={outbound}
        nodesById={nodesById}
        selfId={node.id}
        direction="out"
        onSelect={onSelectNeighbor}
      />
      <NeighborList
        title="Inbound"
        links={inbound}
        nodesById={nodesById}
        selfId={node.id}
        direction="in"
        onSelect={onSelectNeighbor}
      />
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
            direction === 'out' ? resolveId(link.target) : resolveId(link.source)
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

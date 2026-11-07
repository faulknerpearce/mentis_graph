import { useMemo, type CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { linkEnd } from '../graph/buildGraph'
import { safeUrlTransform } from '../lib/safeUrl'
import type { GraphLink, GraphNode } from '../types'
import { Icon } from './Icon'
import { formatDate } from '../lib/format'

interface InspectorProps {
  node: GraphNode
  links: GraphLink[]
  nodesById: Map<string, GraphNode>
  colorOf: (node: GraphNode) => string
  onSelect: (id: string) => void
  onClose: () => void
}

/** How an edge reads from the target's side. */
const INBOUND_LABEL: Record<string, string> = {
  Supersedes: 'Superseded by',
  Corrects: 'Corrected by',
  Invalidates: 'Invalidated by',
  Contradicts: 'Contradicted by',
  References: 'Referenced by',
  DerivedFrom: 'Source for',
  Supports: 'Supported by',
  CausedBy: 'Led to',
  Summarizes: 'Summarized by',
  ContinuesFrom: 'Continued by',
  BranchesFrom: 'Branched into',
  RelatedTo: 'Related to',
  Precedes: 'Previous',
  Mentions: 'Mentioned by',
}

const OUTBOUND_LABEL: Record<string, string> = {
  Precedes: 'Next',
  DerivedFrom: 'Derived from',
  CausedBy: 'Caused by',
  ContinuesFrom: 'Continues from',
  BranchesFrom: 'Branches from',
  RelatedTo: 'Related to',
}

const CATEGORY_ORDER = ['lineage', 'reasoning', 'reference', 'sequence']

interface Group {
  label: string
  category: string
  outbound: boolean
  ids: string[]
}

export function Inspector({
  node,
  links,
  nodesById,
  colorOf,
  onSelect,
  onClose,
}: InspectorProps) {
  const thought = node.thought

  const groups = useMemo(() => {
    const byLabel = new Map<string, Group>()
    for (const link of links) {
      const source = linkEnd(link.source)
      const target = linkEnd(link.target)
      const outbound = source === node.id
      if (!outbound && target !== node.id) continue
      const label = outbound
        ? (OUTBOUND_LABEL[link.kind] ?? link.kind)
        : (INBOUND_LABEL[link.kind] ?? `${link.kind} (in)`)
      const group = byLabel.get(label) ?? {
        label,
        category: link.category,
        outbound,
        ids: [],
      }
      group.ids.push(outbound ? target : source)
      byLabel.set(label, group)
    }
    return [...byLabel.values()].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        b.ids.length - a.ids.length,
    )
  }, [links, node.id])

  const resolve = (ids: string[]) =>
    ids.map((id) => nodesById.get(id)).filter((n): n is GraphNode => Boolean(n))
  const current = node.currentId ? nodesById.get(node.currentId) : undefined
  const successors = current ? [current] : resolve(node.successors)
  const history = resolve(node.versions)

  return (
    <aside className="inspector glass" aria-label="Thought details">
      <header className="inspector-head">
        <div className="inspector-kicker">
          <span className="type-chip" style={{ '--chip': colorOf(node) } as CSSProperties}>
            {node.thoughtType}
          </span>
          <span className="muted mono">
            {node.chainKey} · #{node.index}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="inspector-scroll">
        {node.status !== 'live' && (
          <div className={`status-banner ${node.status}`}>
            <strong>
              {node.status === 'contested'
                ? 'Contested by a newer thought'
                : current
                  ? 'Superseded. Current version:'
                  : 'Retired: archived and hidden from retrieval'}
            </strong>
            {successors.map((s) => (
              <button key={s.id} type="button" className="link-btn" onClick={() => onSelect(s.id)}>
                #{s.index} {s.title}
              </button>
            ))}
          </div>
        )}

        <article className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrlTransform}>
            {thought.content}
          </ReactMarkdown>
        </article>

        <dl className="meta-grid">
          <Meta label="Agent" value={node.agent} />
          <Meta label="Recorded" value={formatDate(node.time)} />
          <Meta label="Role" value={thought.role} />
          <Meta label="Connections" value={String(node.degree)} />
          <Gauge label="Importance" value={thought.importance} />
          <Gauge label="Confidence" value={thought.confidence} />
        </dl>

        {(thought.tags.length > 0 || thought.concepts.length > 0) && (
          <div className="chips">
            {thought.concepts.map((c) => (
              <span key={`c-${c}`} className="chip concept">
                {c}
              </span>
            ))}
            {thought.tags.map((tag) => (
              <span key={`t-${tag}`} className="chip">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {node.archived > 0 && (
          <div className="status-banner archive">
            <strong>Cleanup event: retired {node.archived} older memories</strong>
          </div>
        )}

        {history.length > 0 && (
          <section className="conn-group">
            <h3>
              <Icon name="layers" size={13} />
              Earlier versions
              <span className="count">{history.length}</span>
            </h3>
            <ul>
              {history.map((other) => (
                <li key={other.id}>
                  <button type="button" className="conn-item" onClick={() => onSelect(other.id)}>
                    <span className="dot hollow" style={{ '--dot': colorOf(other) } as CSSProperties} />
                    <span className="conn-title">{other.title}</span>
                    <span className="conn-index mono">{formatDate(other.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map((group) => (
          <section key={group.label} className="conn-group">
            <h3>
              <Icon name={group.outbound ? 'arrowOut' : 'arrowIn'} size={13} />
              {group.label}
              <span className="count">{group.ids.length}</span>
            </h3>
            <ul>
              {group.ids.map((id) => {
                const other = nodesById.get(id)
                if (!other) return null
                return (
                  <li key={id}>
                    <button type="button" className="conn-item" onClick={() => onSelect(id)}>
                      <span
                        className={`dot${other.status === 'retired' ? ' hollow' : ''}`}
                        style={{ '--dot': colorOf(other) } as CSSProperties}
                      />
                      <span className="conn-title">{other.title}</span>
                      <span className="conn-index mono">#{other.index}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <details className="provenance">
          <summary>Provenance</summary>
          <dl>
            <Meta label="ID" value={thought.id} mono />
            <Meta label="Hash" value={thought.hash || '—'} mono />
            <Meta label="Prev hash" value={thought.prev_hash || '—'} mono />
            <Meta label="Entity" value={thought.entity_type || '—'} />
            <Meta label="Owner" value={thought.agent_owner || '—'} />
            <Meta label="Timestamp" value={new Date(thought.timestamp).toLocaleString()} />
          </dl>
        </details>
      </div>
    </aside>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="meta-item">
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value}</dd>
    </div>
  )
}

function Gauge({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="meta-item">
      <dt>{label}</dt>
      <dd className="gauge">
        <span className="gauge-track">
          <span className="gauge-fill" style={{ width: `${(value ?? 0) * 100}%` }} />
        </span>
        <span className="mono">{value != null ? value.toFixed(2) : '—'}</span>
      </dd>
    </div>
  )
}

import type { CSSProperties } from 'react'
import { formatDate } from '../lib/format'
import type { GraphNode, TopicNode } from '../types'
import { Icon } from './Icon'

interface TopicPanelProps {
  topic: TopicNode
  members: GraphNode[]
  colorOf: (node: GraphNode) => string
  chainColor: (chain: string) => string
  onSelect: (id: string) => void
  onClose: () => void
}

export function TopicPanel({ topic, members, colorOf, chainColor, onSelect, onClose }: TopicPanelProps) {
  const byChain = new Map<string, number>()
  for (const m of members) byChain.set(m.chainKey, (byChain.get(m.chainKey) ?? 0) + 1)
  const chains = [...byChain.entries()].sort((a, b) => b[1] - a[1])
  const sorted = [...members].sort((a, b) => b.time - a.time)

  return (
    <aside className="inspector glass" aria-label="Topic details">
      <header className="inspector-head">
        <div className="inspector-kicker">
          <span className="type-chip topic-chip">
            <Icon name="topics" size={12} />
            Topic
          </span>
          <span className="muted">
            {members.length} memories · {chains.length} {chains.length === 1 ? 'chain' : 'chains'}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="inspector-scroll">
        <h2 className="topic-title">{topic.title}</h2>

        <div className="chain-bar" aria-label="Memories per chain">
          {chains.map(([chain, count]) => (
            <span
              key={chain}
              title={`${chain}: ${count}`}
              style={{ flex: count, '--dot': chainColor(chain) } as CSSProperties}
            />
          ))}
        </div>
        <div className="chips">
          {chains.map(([chain, count]) => (
            <span key={chain} className="chip">
              <i className="dot" style={{ '--dot': chainColor(chain) } as CSSProperties} />
              {chain} <span className="count">{count}</span>
            </span>
          ))}
        </div>

        <section className="conn-group">
          <h3>
            Memories
            <span className="count">{members.length}</span>
          </h3>
          <ul>
            {sorted.map((m) => (
              <li key={m.id}>
                <button type="button" className="conn-item" onClick={() => onSelect(m.id)}>
                  <span className="dot" style={{ '--dot': colorOf(m) } as CSSProperties} />
                  <span className="conn-title">{m.title}</span>
                  <span className="conn-index mono">{formatDate(m.time)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  )
}

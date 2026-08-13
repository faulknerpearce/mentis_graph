import { useState } from 'react'
import type { FacetOption } from '../types'

type Tab = 'Types' | 'Chain'

interface ExplorerProps {
  typeOptions: FacetOption[]
  chainOptions: FacetOption[]

  selectedTypes: Set<string> | null
  chainFilter: Set<string> | null

  onTypesChange: (s: Set<string> | null) => void
  onChainFilterChange: (s: Set<string> | null) => void
}

function toggleValue(
  current: Set<string> | null,
  value: string,
): Set<string> | null {
  if (current === null) return new Set([value])
  const next = new Set(current)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next.size ? next : null
}

export function Explorer({
  typeOptions,
  chainOptions,
  selectedTypes,
  chainFilter,
  onTypesChange,
  onChainFilterChange,
}: ExplorerProps) {
  const [tab, setTab] = useState<Tab>('Types')

  const anyFiltered =
    (selectedTypes?.size ?? 0) > 0 || (chainFilter?.size ?? 0) > 0

  const resetAll = () => {
    onTypesChange(null)
    onChainFilterChange(null)
  }

  return (
    <div className="explorer">
      <div className="explorer-header">
        <span className="field-label">Browse</span>
        <button
          type="button"
          className="btn ghost btn-xs"
          onClick={resetAll}
          disabled={!anyFiltered}
        >
          Clear
        </button>
      </div>

      <div className="sidebar-tabs">
        {(['Types', 'Chain'] as Tab[]).map((name) => (
          <button
            key={name}
            type="button"
            className={`sidebar-tab${tab === name ? ' active' : ''}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="sidebar-list-wrap">
        {tab === 'Types' && (
          <FacetList
            options={typeOptions}
            selected={selectedTypes}
            onToggle={(v) => onTypesChange(toggleValue(selectedTypes, v))}
          />
        )}
        {tab === 'Chain' && (
          <FacetList
            options={chainOptions}
            selected={chainFilter}
            onToggle={(v) => onChainFilterChange(toggleValue(chainFilter, v))}
          />
        )}
      </div>
    </div>
  )
}

function FacetList({
  options,
  selected,
  onToggle,
}: {
  options: FacetOption[]
  selected: Set<string> | null
  onToggle: (value: string) => void
}) {
  if (options.length === 0) {
    return <p className="sidebar-empty">Nothing loaded yet.</p>
  }
  return (
    <ul className="sidebar-list">
      {options.map((option) => {
        const active = selected?.has(option.value) ?? false
        return (
          <li key={option.value}>
            <button
              type="button"
              className={`sidebar-row${active ? ' active' : ''}`}
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
            >
              {option.color && (
                <span
                  className="row-dot"
                  style={{ background: option.color }}
                  aria-hidden="true"
                />
              )}
              <span className="row-label">{option.label}</span>
              <span className="row-count">{option.count}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

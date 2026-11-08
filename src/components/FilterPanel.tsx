import type { CSSProperties } from 'react'
import { EDGE_CATEGORIES, TYPE_FAMILIES, OTHER_FAMILY, familyOf } from '../graph/taxonomy'
import { toggleFacet } from '../lib/facets'
import type { ColorMode, RelationCategory, EdgeToggles, FacetOption } from '../types'

interface FilterPanelProps {
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
  typeColor: (thoughtType: string) => string
  edgeColor: (category: RelationCategory) => string
  edgeCounts: Record<RelationCategory, number>
  edges: EdgeToggles
  onEdgesChange: (edges: EdgeToggles) => void
  showRetired: boolean
  onShowRetiredChange: (value: boolean) => void
  retiredCount: number
  contestedCount: number
  chainOptions: FacetOption[]
  chains: Set<string> | null
  onChainsChange: (chains: Set<string> | null) => void
  typeOptions: FacetOption[]
  types: Set<string> | null
  onTypesChange: (types: Set<string> | null) => void
  agentOptions: FacetOption[]
}

const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: 'type', label: 'Type' },
  { id: 'chain', label: 'Chain' },
  { id: 'agent', label: 'Agent' },
]

const AGENT_LEGEND_LIMIT = 14

export function FilterPanel(props: FilterPanelProps) {
  const {
    colorMode,
    onColorModeChange,
    typeColor,
    edgeColor,
    edgeCounts,
    edges,
    onEdgesChange,
    showRetired,
    onShowRetiredChange,
    retiredCount,
    contestedCount,
    chainOptions,
    chains,
    onChainsChange,
    typeOptions,
    types,
    onTypesChange,
    agentOptions,
  } = props

  const allChains = chainOptions.map((o) => o.value)
  const allTypes = typeOptions.map((o) => o.value)
  const families = [
    ...TYPE_FAMILIES.map((f) => ({ id: f.id, label: f.label })),
    { id: OTHER_FAMILY, label: 'Other' },
  ]
    .map((family) => {
      const options = typeOptions.filter((o) => familyOf(o.value) === family.id)
      return { ...family, options, count: options.reduce((sum, o) => sum + o.count, 0) }
    })
    .filter((family) => family.options.length > 0)

  return (
    <aside className="filter-panel glass" aria-label="Filters">
      <section className="panel-section">
        <div className="section-label">Color by</div>
        <div className="segmented" role="radiogroup" aria-label="Color nodes by">
          {COLOR_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={colorMode === mode.id}
              className={colorMode === mode.id ? 'is-active' : undefined}
              onClick={() => onColorModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-label">Memory state</div>
        <div className="state-legend">
          <span><i className="glyph live" />Live</span>
          <span><i className="glyph contested" />Contested {contestedCount}</span>
          <span><i className="glyph retired" />Retired {retiredCount}</span>
        </div>
        <label className="switch-row">
          <span>
            Show retired memories
            <small>Superseded, corrected or invalidated</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={showRetired}
            onChange={(e) => onShowRetiredChange(e.target.checked)}
          />
        </label>
      </section>

      <section className="panel-section">
        <div className="section-label">Connections</div>
        {EDGE_CATEGORIES.map((category) => (
          <label key={category.id} className="switch-row">
            <span className="edge-label">
              <i className="edge-sample" style={{ '--edge': edgeColor(category.id) } as CSSProperties} />
              <span>
                {category.label}
                <small>{category.hint}</small>
              </span>
            </span>
            <span className="row-end">
              <span className="count">{edgeCounts[category.id]}</span>
              <input
                type="checkbox"
                className="switch"
                checked={edges[category.id]}
                onChange={(e) => onEdgesChange({ ...edges, [category.id]: e.target.checked })}
              />
            </span>
          </label>
        ))}
      </section>

      <section className="panel-section">
        <div className="section-label">
          Chains
          {chains && (
            <button type="button" className="text-btn" onClick={() => onChainsChange(null)}>
              Show all
            </button>
          )}
        </div>
        <ul className="facet-list">
          {chainOptions.map((option) => (
            <FacetRow
              key={option.value}
              option={option}
              active={!chains || chains.has(option.value)}
              color={colorMode === 'chain' ? option.color : undefined}
              onToggle={() => onChainsChange(toggleFacet(chains, [option.value], allChains))}
              onOnly={() => onChainsChange(new Set([option.value]))}
            />
          ))}
        </ul>
      </section>

      <section className="panel-section">
        <div className="section-label">
          Thought types
          {types && (
            <button type="button" className="text-btn" onClick={() => onTypesChange(null)}>
              Show all
            </button>
          )}
        </div>
        {families.map((family) => {
          const values = family.options.map((o) => o.value)
          const activeCount = values.filter((v) => !types || types.has(v)).length
          return (
            <div key={family.id} className="family">
              <button
                type="button"
                className={`family-head${activeCount === 0 ? ' is-off' : ''}`}
                onClick={() => onTypesChange(toggleFacet(types, values, allTypes))}
              >
                <i
                  className="dot"
                  style={{ '--dot': colorMode === 'type' ? typeColor(family.options[0].value) : undefined } as CSSProperties}
                />
                <span>{family.label}</span>
                <span className="count">{family.count}</span>
              </button>
              {family.options.length > 1 && (
                <ul className="facet-list nested">
                  {family.options.map((option) => (
                    <FacetRow
                      key={option.value}
                      option={option}
                      active={!types || types.has(option.value)}
                      color={colorMode === 'type' ? typeColor(option.value) : undefined}
                      onToggle={() => onTypesChange(toggleFacet(types, [option.value], allTypes))}
                      onOnly={() => onTypesChange(new Set([option.value]))}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      {colorMode === 'agent' && (
        <section className="panel-section">
          <div className="section-label">Agents</div>
          <ul className="facet-list">
            {agentOptions.slice(0, AGENT_LEGEND_LIMIT).map((option) => (
              <li key={option.value} className="facet-row static">
                <i className="dot" style={{ '--dot': option.color } as CSSProperties} />
                <span className="facet-name">{option.label}</span>
                <span className="count">{option.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

function FacetRow({
  option,
  active,
  color,
  onToggle,
  onOnly,
}: {
  option: FacetOption
  active: boolean
  color?: string
  onToggle: () => void
  onOnly: () => void
}) {
  return (
    <li className={`facet-row${active ? '' : ' is-off'}`}>
      <button type="button" className="facet-toggle" onClick={onToggle} aria-pressed={active}>
        <i className={`check${active ? ' on' : ''}`} style={{ '--dot': color } as CSSProperties} />
        <span className="facet-name">{option.label}</span>
        <span className="count">{option.count}</span>
      </button>
      <button type="button" className="only-btn" onClick={onOnly}>
        only
      </button>
    </li>
  )
}

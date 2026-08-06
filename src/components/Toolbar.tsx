import type { EdgeToggles, GraphMode } from '../types'
import { TYPE_COLORS } from '../graph/buildGraph'

interface ToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  thoughtTypes: string[]
  selectedTypes: Set<string> | null
  onTypesChange: (types: Set<string> | null) => void
  edgeToggles: EdgeToggles
  onEdgeTogglesChange: (toggles: EdgeToggles) => void
  graphMode: GraphMode
  onGraphModeChange: (mode: GraphMode) => void
  loading: boolean
  progress: string | null
  nodeCount: number
  linkCount: number
  onReload: () => void
  onResetLayout: () => void
}

export function Toolbar({
  search,
  onSearchChange,
  thoughtTypes,
  selectedTypes,
  onTypesChange,
  edgeToggles,
  onEdgeTogglesChange,
  graphMode,
  onGraphModeChange,
  loading,
  progress,
  nodeCount,
  linkCount,
  onReload,
  onResetLayout,
}: ToolbarProps) {
  const toggleType = (type: string) => {
    if (selectedTypes === null) {
      onTypesChange(new Set([type]))
      return
    }
    const next = new Set(selectedTypes)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    onTypesChange(next.size === 0 ? null : next)
  }

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="stats" style={{ fontWeight: 650, color: 'var(--text)' }}>
          Thought graph
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.55rem' }}>
            {progress ? progress : `${nodeCount} nodes · ${linkCount} links`}
          </span>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="Find a thought…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          onClick={onReload}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Reload'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={onResetLayout}
          disabled={loading}
        >
          Reset layout
        </button>
        <div className="mode-toggle" role="group" aria-label="Graph mode">
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn ghost${graphMode === mode ? ' active' : ''}`}
              onClick={() => onGraphModeChange(mode)}
              aria-pressed={graphMode === mode}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-row wrap">
        <span className="field-label">Edges</span>
        {(
          [
            ['relations', 'Relations'],
            ['refs', 'Refs'],
            ['spine', 'Hash spine'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="chip-toggle">
            <input
              type="checkbox"
              checked={edgeToggles[key]}
              onChange={(e) =>
                onEdgeTogglesChange({
                  ...edgeToggles,
                  [key]: e.target.checked,
                })
              }
            />
            {label}
          </label>
        ))}

        <button
          type="button"
          className="btn ghost"
          onClick={() => onTypesChange(null)}
        >
          All types
        </button>
      </div>

      <div className="type-filters">
        {thoughtTypes.map((type) => {
          const active = selectedTypes === null || selectedTypes.has(type)
          return (
            <button
              key={type}
              type="button"
              className={`type-chip${active ? ' active' : ''}`}
              style={{
                ['--chip-color' as string]: TYPE_COLORS[type] ?? '#78716c',
              }}
              onClick={() => toggleType(type)}
            >
              {type}
            </button>
          )
        })}
      </div>
    </div>
  )
}

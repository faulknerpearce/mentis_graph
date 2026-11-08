import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Theme } from '../hooks/useTheme'
import type { GraphMode, GraphNode, LayoutMode } from '../types'
import { Icon } from './Icon'
import { Logo } from './Logo'

interface TopBarProps {
  search: string
  onSearchChange: (value: string) => void
  results: GraphNode[] | null
  colorOf: (node: GraphNode) => string
  onPick: (node: GraphNode) => void
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
  theme: Theme
  onToggleTheme: () => void
  loading: boolean
  onReload: () => void
  onResetLayout: () => void
  panelOpen: boolean
  onTogglePanel: () => void
}

const MAX_RESULTS = 8

const LAYOUT_LABELS: Record<LayoutMode, string> = {
  network: 'Network',
  topics: 'Topics',
  timeline: 'Timeline',
}

export function TopBar({
  search,
  onSearchChange,
  results,
  colorOf,
  onPick,
  layout,
  onLayoutChange,
  mode,
  onModeChange,
  theme,
  onToggleTheme,
  loading,
  onReload,
  onResetLayout,
  panelOpen,
  onTogglePanel,
}: TopBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const shown = results?.slice(0, MAX_RESULTS) ?? []

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setActive(0), [search])

  const pick = (node: GraphNode) => {
    onPick(node)
    inputRef.current?.blur()
  }

  return (
    <header className="topbar">
      <div className="brand glass">
        <button
          type="button"
          className={`icon-btn${panelOpen ? ' is-active' : ''}`}
          onClick={onTogglePanel}
          aria-label={panelOpen ? 'Hide filters' : 'Show filters'}
          title={panelOpen ? 'Hide filters' : 'Show filters'}
        >
          <Icon name="sliders" />
        </button>
        <Logo className="brand-mark" />
        <div className="brand-text">
          <span className="brand-name">Mentis</span>
          <span className="brand-sub">Thought graph</span>
        </div>
      </div>

      <div className={`search glass${focused ? ' is-focused' : ''}`}>
        <Icon name="search" />
        <input
          ref={inputRef}
          type="search"
          value={search}
          placeholder="Search memories, tags, #index…"
          aria-label="Search memories"
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onSearchChange('')
              inputRef.current?.blur()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && shown[active]) {
              pick(shown[active])
            }
          }}
        />
        {results ? (
          <span className="search-count">{results.length}</span>
        ) : (
          <kbd>⌘K</kbd>
        )}
        {focused && results && (
          <ul className="search-results glass" role="listbox">
            {shown.length === 0 && <li className="empty">No memories match</li>}
            {shown.map((node, i) => (
              <li key={node.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={i === active ? 'is-active' : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(node)}
                >
                  <i
                    className={`dot${node.status === 'retired' ? ' hollow' : ''}`}
                    style={{ '--dot': colorOf(node) } as CSSProperties}
                  />
                  <span className="result-title">{node.title}</span>
                  <span className="result-meta mono">
                    {node.chainKey} #{node.index}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="actions glass">
        <div className="segmented compact" role="radiogroup" aria-label="Organise by">
          {(['network', 'topics', 'timeline'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={layout === l}
              className={layout === l ? 'is-active' : undefined}
              onClick={() => onLayoutChange(l)}
            >
              {LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="segmented compact" role="radiogroup" aria-label="Graph mode">
          {(['2d', '3d'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? 'is-active' : undefined}
              onClick={() => onModeChange(m)}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" onClick={onResetLayout} title="Re-run layout" aria-label="Re-run layout">
          <Icon name="layout" />
        </button>
        <button
          type="button"
          className={`icon-btn${loading ? ' is-spinning' : ''}`}
          onClick={onReload}
          disabled={loading}
          title="Reload from MentisDB"
          aria-label="Reload from MentisDB"
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
      </div>
    </header>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listChains, loadThoughtsForChains } from './api/mentis'
import { buildGraph, filterGraph } from './graph/buildGraph'
import { ChainPicker } from './components/ChainPicker'
import { ThoughtGraph } from './components/ThoughtGraph'
import { ThoughtDetail } from './components/ThoughtDetail'
import { Toolbar } from './components/Toolbar'
import { useTheme } from './hooks/useTheme'
import type {
  ChainInfo,
  EdgeToggles,
  GraphMode,
  GraphNode,
  Thought,
} from './types'

const DEFAULT_EDGES: EdgeToggles = {
  relations: true,
  refs: true,
  spine: true,
}

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [chains, setChains] = useState<ChainInfo[]>([])
  const [defaultChainKey, setDefaultChainKey] = useState('')
  // Empty until /v1/chains resolves — avoids a hardcoded default double-fetch.
  const [selectedChains, setSelectedChains] = useState<string[]>([])
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string> | null>(null)
  const [edgeToggles, setEdgeToggles] = useState<EdgeToggles>(DEFAULT_EDGES)
  const [graphMode, setGraphMode] = useState<GraphMode>('2d')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layoutResetKey, setLayoutResetKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await listChains()
        if (cancelled) return
        setChains(res.chains)
        setDefaultChainKey(res.default_chain_key)
        setSelectedChains(res.chain_keys)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to list MentisDB chains. Is the daemon running on :9472?',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadThoughts = useCallback(async (keys: string[]) => {
    if (keys.length === 0) return
    setLayoutResetKey((key) => key + 1)
    setLoading(true)
    setError(null)
    setProgress('Starting…')
    setSelectedId(null)
    try {
      const loaded = await loadThoughtsForChains(keys, (count, chainKey) => {
        setProgress(`Loaded ${count} from ${chainKey}…`)
      })
      setThoughts(loaded)
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleEdgeTogglesChange = (next: EdgeToggles) => {
    setEdgeToggles(next)
  }

  const resetLayout = () => {
    setLayoutResetKey((key) => key + 1)
  }

  useEffect(() => {
    if (selectedChains.length === 0) return
    void loadThoughts(selectedChains)
  }, [selectedChains, loadThoughts])

  const thoughtTypes = useMemo(() => {
    const types = new Set(thoughts.map((t) => t.thought_type))
    return [...types].sort()
  }, [thoughts])

  const fullGraph = useMemo(
    () => buildGraph(thoughts, edgeToggles),
    [thoughts, edgeToggles],
  )

  const visibleGraph = useMemo(
    () =>
      filterGraph(fullGraph, {
        thoughtTypes: selectedTypes,
        search,
      }),
    [fullGraph, selectedTypes, search],
  )

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNode>()
    // Prefer full graph so a selected thought stays resolvable even if filters hide it.
    for (const node of fullGraph.nodes) map.set(node.id, node)
    return map
  }, [fullGraph.nodes])

  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null

  const detailLinks = useMemo(() => {
    if (!selectedId) return visibleGraph.links
    // Show neighbors from the full graph, not only the filtered view.
    return fullGraph.links.filter((link) => {
      const source =
        typeof link.source === 'string'
          ? link.source
          : (link.source as { id?: string }).id
      const target =
        typeof link.target === 'string'
          ? link.target
          : (link.target as { id?: string }).id
      return source === selectedId || target === selectedId
    })
  }, [selectedId, fullGraph.links, visibleGraph.links])

  const handleSelect = (node: GraphNode | null) => {
    setSelectedId(node?.id ?? null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Mentis Thought Graph</h1>
          <p>Interactive view of MentisDB thought chains and relations</p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span className="theme-toggle-icon" aria-hidden="true">
            {theme === 'light' ? '◐' : '◑'}
          </span>
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <div className="app-body">
        <aside className="sidebar">
          <ChainPicker
            chains={chains}
            selected={selectedChains}
            defaultChainKey={defaultChainKey}
            disabled={loading}
            onChange={setSelectedChains}
            onLoadAll={() => setSelectedChains(chains.map((c) => c.chain_key))}
          />
        </aside>

        <main className="main-pane">
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            thoughtTypes={thoughtTypes}
            selectedTypes={selectedTypes}
            onTypesChange={setSelectedTypes}
            edgeToggles={edgeToggles}
            onEdgeTogglesChange={handleEdgeTogglesChange}
            graphMode={graphMode}
            onGraphModeChange={setGraphMode}
            loading={loading}
            progress={progress}
            nodeCount={visibleGraph.nodes.length}
            linkCount={visibleGraph.links.length}
            onReload={() => void loadThoughts(selectedChains)}
            onResetLayout={resetLayout}
          />
          <div className="graph-stage">
            <ThoughtGraph
              data={visibleGraph}
              selectedId={selectedId}
              theme={theme}
              onSelect={handleSelect}
              mode={graphMode}
              resetKey={layoutResetKey}
            />
          </div>
        </main>

        <ThoughtDetail
          node={selectedNode}
          links={detailLinks}
          nodesById={nodesById}
          onSelectNeighbor={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}

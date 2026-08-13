import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listChains, loadThoughtsForChains } from './api/mentis'
import { buildGraph, filterGraph, neighborIdsFor } from './graph/buildGraph'
import { ChainPicker } from './components/ChainPicker'
import { ThoughtGraph } from './components/ThoughtGraph'
import { ThoughtContentModal } from './components/ThoughtContentModal'
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
  const loadGenRef = useRef(0)

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
    const gen = ++loadGenRef.current
    const isCancelled = () => gen !== loadGenRef.current

    setLayoutResetKey((key) => key + 1)
    setLoading(true)
    setError(null)
    setProgress('Starting…')
    setSelectedId(null)
    try {
      const loaded = await loadThoughtsForChains(
        keys,
        (count, chainKey) => {
          if (isCancelled()) return
          setProgress(`Loaded ${count} from ${chainKey}…`)
        },
        isCancelled,
      )
      if (isCancelled()) return
      setThoughts(loaded)
      setProgress(null)
    } catch (err) {
      if (isCancelled()) return
      setError(err instanceof Error ? err.message : String(err))
      setProgress(null)
    } finally {
      if (!isCancelled()) setLoading(false)
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

  // Always full-graph neighbors so dimming matches the detail panel.
  const selectionNeighborIds = useMemo(
    () => neighborIdsFor(selectedId, fullGraph.links),
    [selectedId, fullGraph.links],
  )

  const handleSelect = (node: GraphNode | null) => {
    setSelectedId(node?.id ?? null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <h1 className="brand-name">Mentis</h1>
          <div className="brand-product">Thought Graph</div>
          <p className="brand-tagline">
            Memory chains and relations from MentisDB
          </p>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <svg
            className="theme-toggle-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {theme === 'light' ? (
              <>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </>
            )}
          </svg>
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
            theme={theme}
          />
          <div className="graph-stage">
            <ThoughtGraph
              data={visibleGraph}
              selectedId={selectedId}
              neighborIds={selectionNeighborIds}
              theme={theme}
              onSelect={handleSelect}
              mode={graphMode}
              resetKey={layoutResetKey}
            />
            {selectedNode && (
              <ThoughtContentModal
                node={selectedNode}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>
        </main>

        <ThoughtDetail
          node={selectedNode}
          links={fullGraph.links}
          nodesById={nodesById}
          onSelectNeighbor={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listChains, loadThoughtsForChains } from './api/mentis'
import { buildGraph, filterGraph, neighborIdsFor, searchNodes } from './graph/buildGraph'
import { buildTopicIndex, withTopics } from './graph/topics'
import { FilterPanel } from './components/FilterPanel'
import { Inspector } from './components/Inspector'
import { ThoughtGraph, type FocusRequest } from './components/ThoughtGraph'
import { Timeline } from './components/Timeline'
import { TopicPanel } from './components/TopicPanel'
import { TopBar } from './components/TopBar'
import { useTheme } from './hooks/useTheme'
import { facetOptions } from './lib/facets'
import {
  categoricalScale,
  colorizeGraph,
  edgeSampleColor,
  nodeColorFn,
  typeColor,
} from './theme/palette'
import type {
  ColorMode,
  EdgeToggles,
  GraphMode,
  LayoutMode,
  MapNode,
  RelationCategory,
  Thought,
  TopicNode,
} from './types'

const ALL_EDGES: EdgeToggles = {
  lineage: true,
  reasoning: true,
  reference: true,
  session: true,
  sequence: true,
}

/** Edges that shape each layout by default, and the colouring that reads best. */
const LAYOUT_DEFAULTS: Record<
  LayoutMode,
  { sequence: boolean; session: boolean; color: ColorMode }
> = {
  network: { sequence: true, session: false, color: 'type' },
  topics: { sequence: false, session: true, color: 'chain' },
}

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [chainKeys, setChainKeys] = useState<string[]>([])
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<Set<string> | null>(null)
  const [chains, setChains] = useState<Set<string> | null>(null)
  const [layout, setLayout] = useState<LayoutMode>('network')
  const [edges, setEdges] = useState<EdgeToggles>({
    ...ALL_EDGES,
    sequence: LAYOUT_DEFAULTS.network.sequence,
    session: LAYOUT_DEFAULTS.network.session,
  })
  const [showRetired, setShowRetired] = useState(false)
  const [until, setUntil] = useState<number | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>(LAYOUT_DEFAULTS.network.color)
  const [graphMode, setGraphMode] = useState<GraphMode>('2d')
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<FocusRequest | null>(null)
  const [layoutResetKey, setLayoutResetKey] = useState(0)
  const loadGenRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    listChains()
      .then((res) => {
        if (!cancelled) setChainKeys(res.chain_keys)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to list MentisDB chains. Is the daemon running on :9472?',
        )
      })
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
    setProgress('Connecting to MentisDB…')
    setSelectedId(null)
    let total = 0
    let lastChain = ''
    let chainBase = 0
    try {
      const loaded = await loadThoughtsForChains(
        keys,
        (count, chainKey) => {
          if (isCancelled()) return
          if (chainKey !== lastChain) {
            chainBase = total
            lastChain = chainKey
          }
          total = chainBase + count
          setProgress(`${total.toLocaleString()} memories · ${chainKey}`)
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

  useEffect(() => {
    void loadThoughts(chainKeys)
  }, [chainKeys, loadThoughts])

  const fullGraph = useMemo(() => buildGraph(thoughts), [thoughts])

  const nodesById = useMemo(
    () => new Map(fullGraph.nodes.map((node) => [node.id, node])),
    [fullGraph.nodes],
  )

  const chainCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of fullGraph.nodes) {
      counts.set(node.chainKey, (counts.get(node.chainKey) ?? 0) + 1)
    }
    return counts
  }, [fullGraph.nodes])

  const chainColor = useMemo(
    () =>
      categoricalScale(
        [...chainCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
        theme,
      ),
    [chainCounts, theme],
  )

  const agentOptionsRaw = useMemo(
    () => facetOptions(fullGraph.nodes, (n) => n.agent),
    [fullGraph.nodes],
  )
  const agentColor = useMemo(
    () => categoricalScale(agentOptionsRaw.map((o) => o.value), theme),
    [agentOptionsRaw, theme],
  )

  const colorOf = useMemo(
    () => nodeColorFn(colorMode, theme, chainColor, agentColor),
    [colorMode, theme, chainColor, agentColor],
  )

  // Status filter only: drives facet counts so they match what can be shown.
  const statusScoped = useMemo(
    () =>
      filterGraph(fullGraph, {
        edges: ALL_EDGES,
        showRetired,
        types: null,
        chains: null,
        until: null,
      }),
    [fullGraph, showRetired],
  )

  // Every filter except time: feeds the timeline histogram.
  const scoped = useMemo(
    () => filterGraph(statusScoped, { edges: ALL_EDGES, showRetired: true, types, chains, until: null }),
    [statusScoped, types, chains],
  )

  const visibleGraph = useMemo(
    () => filterGraph(scoped, { edges, showRetired: true, types: null, chains: null, until }),
    [scoped, edges, until],
  )

  const topicIndex = useMemo(() => buildTopicIndex(fullGraph.nodes), [fullGraph.nodes])

  const mapData = useMemo(
    () => (layout === 'topics' ? withTopics(visibleGraph, topicIndex) : visibleGraph),
    [layout, visibleGraph, topicIndex],
  )

  const coloredGraph = useMemo(
    () => colorizeGraph(mapData, theme, colorOf),
    [mapData, theme, colorOf],
  )

  const searchResults = useMemo(
    () => searchNodes(visibleGraph.nodes, search),
    [visibleGraph.nodes, search],
  )

  const highlight = useMemo(() => {
    if (selectedId) return neighborIdsFor(selectedId, mapData.links)
    if (searchResults) return new Set(searchResults.map((n) => n.id))
    return null
  }, [selectedId, mapData.links, searchResults])

  const typeOptions = useMemo(
    () => facetOptions(statusScoped.nodes, (n) => n.thoughtType),
    [statusScoped.nodes],
  )
  const chainOptions = useMemo(
    () => facetOptions(statusScoped.nodes, (n) => n.chainKey, chainColor),
    [statusScoped.nodes, chainColor],
  )
  const agentOptions = useMemo(
    () => agentOptionsRaw.map((o) => ({ ...o, color: agentColor(o.value) })),
    [agentOptionsRaw, agentColor],
  )

  const edgeCounts = useMemo(() => {
    const counts: Record<RelationCategory, number> = {
      lineage: 0,
      reasoning: 0,
      reference: 0,
      session: 0,
      sequence: 0,
    }
    for (const link of scoped.links) {
      if (link.category !== 'topic') counts[link.category] += 1
    }
    return counts
  }, [scoped.links])

  const statusCounts = useMemo(() => {
    let retired = 0
    let contested = 0
    for (const node of fullGraph.nodes) {
      if (node.status === 'retired') retired += 1
      else if (node.status === 'contested') contested += 1
    }
    return { retired, contested }
  }, [fullGraph.nodes])

  const times = useMemo(() => scoped.nodes.map((n) => n.time), [scoped.nodes])

  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null
  const selectedTopic = useMemo(
    () =>
      (coloredGraph.nodes.find((n) => n.kind === 'topic' && n.id === selectedId) as
        | TopicNode
        | undefined) ?? null,
    [coloredGraph.nodes, selectedId],
  )
  const topicMembers = useMemo(() => {
    if (!selectedTopic) return []
    return visibleGraph.nodes.filter((n) =>
      topicIndex.byThought.get(n.id)?.includes(selectedTopic.title),
    )
  }, [selectedTopic, visibleGraph.nodes, topicIndex])

  const changeLayout = (next: LayoutMode) => {
    if (next === layout) return
    setLayout(next)
    setEdges((prev) => ({
      ...prev,
      sequence: LAYOUT_DEFAULTS[next].sequence,
      session: LAYOUT_DEFAULTS[next].session,
    }))
    setColorMode(LAYOUT_DEFAULTS[next].color)
    setSelectedId(null)
    setLayoutResetKey((key) => key + 1)
  }

  const focusOn = useCallback(
    (id: string) => {
      const node = nodesById.get(id)
      if (!node) return
      if (node.status === 'retired') setShowRetired(true)
      if (until != null && node.time > until) setUntil(null)
      if (types && !types.has(node.thoughtType)) setTypes(null)
      if (chains && !chains.has(node.chainKey)) setChains(null)
      setSelectedId(id)
      setFocus((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }))
    },
    [nodesById, until, types, chains],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT') return
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const initialLoad = loading && thoughts.length === 0

  return (
    <div
      className={`app-shell${panelOpen ? ' panel-open' : ''}${selectedNode || selectedTopic ? ' inspector-open' : ''}`}
    >
      <div className="stage">
        <ThoughtGraph
          data={coloredGraph}
          layout={layout}
          selectedId={selectedId}
          highlight={highlight}
          theme={theme}
          mode={graphMode}
          resetKey={layoutResetKey}
          focus={focus}
          onSelect={(node: MapNode | null) => setSelectedId(node?.id ?? null)}
        />
      </div>

      <TopBar
        search={search}
        onSearchChange={setSearch}
        results={searchResults}
        colorOf={colorOf}
        onPick={(node) => focusOn(node.id)}
        layout={layout}
        onLayoutChange={changeLayout}
        mode={graphMode}
        onModeChange={setGraphMode}
        theme={theme}
        onToggleTheme={toggleTheme}
        loading={loading}
        onReload={() => void loadThoughts(chainKeys)}
        onResetLayout={() => setLayoutResetKey((key) => key + 1)}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />

      {panelOpen && (
        <FilterPanel
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          typeColor={(type) => typeColor(type, theme)}
          edgeColor={(category) => edgeSampleColor(category, theme)}
          edgeCounts={edgeCounts}
          edges={edges}
          onEdgesChange={setEdges}
          showRetired={showRetired}
          onShowRetiredChange={setShowRetired}
          retiredCount={statusCounts.retired}
          contestedCount={statusCounts.contested}
          chainOptions={chainOptions}
          chains={chains}
          onChainsChange={setChains}
          typeOptions={typeOptions}
          types={types}
          onTypesChange={setTypes}
          agentOptions={agentOptions}
        />
      )}

      {selectedNode && (
        <Inspector
          key={selectedNode.id}
          node={selectedNode}
          links={fullGraph.links}
          nodesById={nodesById}
          colorOf={colorOf}
          onSelect={focusOn}
          onClose={() => setSelectedId(null)}
        />
      )}

      {selectedTopic && (
        <TopicPanel
          key={selectedTopic.id}
          topic={selectedTopic}
          members={topicMembers}
          colorOf={colorOf}
          chainColor={chainColor}
          onSelect={focusOn}
          onClose={() => setSelectedId(null)}
        />
      )}

      <footer className="bottombar">
        <div className="stats glass">
          <strong>{visibleGraph.nodes.length.toLocaleString()}</strong> memories
          <span className="sep" />
          <strong>{visibleGraph.links.length.toLocaleString()}</strong> links
          {layout === 'topics' && (
            <>
              <span className="sep" />
              <strong>{(coloredGraph.nodes.length - visibleGraph.nodes.length).toLocaleString()}</strong> topics
            </>
          )}
          {progress && !initialLoad && <span className="stats-progress">{progress}</span>}
        </div>
        <Timeline times={times} until={until} onChange={setUntil} />
      </footer>

      {error && (
        <div className="toast error glass" role="alert">
          <strong>Can't reach MentisDB</strong>
          <span>{error}</span>
          <button type="button" className="text-btn" onClick={() => void loadThoughts(chainKeys)}>
            Retry
          </button>
        </div>
      )}

      {initialLoad && (
        <div className="loader glass" role="status">
          <div className="loader-orb" aria-hidden="true" />
          <div>
            <strong>Loading thought network</strong>
            <span>{progress}</span>
          </div>
        </div>
      )}
    </div>
  )
}

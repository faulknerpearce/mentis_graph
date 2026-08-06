import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { forceCollide } from 'd3-force-3d'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
import type {
  ForceGraphMethods as ForceGraph3DMethods,
  NodeObject as NodeObject3D,
  LinkObject as LinkObject3D,
} from 'react-force-graph-3d'
import type { Theme } from '../hooks/useTheme'
import type { GraphData, GraphLink, GraphMode, GraphNode } from '../types'

const ForceGraph3D = lazy(() => import('react-force-graph-3d'))

interface ThoughtGraphProps {
  data: GraphData
  selectedId: string | null
  theme: Theme
  onSelect: (node: GraphNode | null) => void
  mode: GraphMode
  resetKey: number
}

type FGNode = NodeObject<GraphNode>
type FGLink = LinkObject<GraphNode, GraphLink>
type SimNode = GraphNode & FGNode & { z?: number }
type FGNode3D = NodeObject3D<GraphNode>
type FGLink3D = LinkObject3D<GraphNode, GraphLink>
type SimNode3D = GraphNode & FGNode3D

type Position = { x: number; y: number; z?: number }

const THEME_CANVAS = {
  light: {
    background: '#fffcf7',
    label: '#57534e',
    selectedStroke: '#1c1917',
    linkFallback: 'rgba(120, 113, 108, 0.28)',
  },
  dark: {
    background: '#12141a',
    label: '#a8a29e',
    selectedStroke: '#fafaf9',
    linkFallback: 'rgba(168, 162, 158, 0.28)',
  },
} as const

/** Max pointer travel (px) still counted as a click, not a pan. */
const CLICK_MOVE_TOLERANCE_PX = 6
/** Extra screen-space radius (px) around each node for easier targeting. */
const HIT_PADDING_PX = 12
/** Minimum graph-space gap between rendered node circles. */
const NODE_GAP = 4

export function ThoughtGraph({
  data,
  selectedId,
  theme,
  onSelect,
  mode,
  resetKey,
}: ThoughtGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined)
  const fg3dRef = useRef<ForceGraph3DMethods | undefined>(undefined)
  // The library runs the d3-force simulation on its own node objects, so the
  // input nodes never receive live x/y. Capture the rendered positions from
  // the per-node paint callback into a map keyed by node id.
  const posRef = useRef(new Map<string, Position>())
  const nodesRef = useRef<SimNode[]>([])
  const lastResetKeyRef = useRef(resetKey)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const [size, setSize] = useState({ width: 0, height: 0 })
  const palette = THEME_CANVAS[theme]

  // Preserve simulation positions across data refreshes.
  const graphData = useMemo(() => {
    if (lastResetKeyRef.current !== resetKey) {
      posRef.current.clear()
      lastResetKeyRef.current = resetKey
    }

    const nodes = data.nodes.map((n) => {
      const pos = posRef.current.get(n.id)
      return pos ? { ...n, ...pos } : ({ ...n } as SimNode)
    }) as SimNode[]

    nodesRef.current = nodes
    return {
      nodes,
      links: data.links.map((l) => ({ ...l })),
    }
  }, [data, resetKey])

  // Keep node circles apart, including the larger selected-node rendering.
  // This force is applied to the simulation's live node objects by the graph
  // library, rather than the immutable React graphData snapshot.
  useEffect(() => {
    const fg = mode === '3d' ? fg3dRef.current : fgRef.current
    if (!fg) return
    const collision = forceCollide<SimNode>((node) =>
      (node.size ?? 4.5) * 1.25 + NODE_GAP,
    ).iterations(4)
    fg.d3Force('collide', collision)
    fg.d3ReheatSimulation()
  }, [graphData, mode, size.width, size.height])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const pos = posRef.current.get(selectedId)
    if (!pos) return
    if (mode === '3d') {
      fg3dRef.current?.cameraPosition(
        { x: pos.x + 80, y: pos.y + 80, z: (pos.z ?? 0) + 80 },
        { x: pos.x, y: pos.y, z: pos.z ?? 0 },
        400,
      )
    } else {
      fgRef.current?.centerAt(pos.x, pos.y, 400)
    }
  }, [selectedId, graphData.nodes, mode])

  const capture3dPositions = useCallback(() => {
    for (const node of graphData.nodes) {
      if (
        node.x != null &&
        node.y != null &&
        node.z != null
      ) {
        posRef.current.set(node.id, { x: node.x, y: node.y, z: node.z })
      }
    }
  }, [graphData.nodes])

  const nodeAtClient = useCallback(
    (clientX: number, clientY: number): GraphNode | null => {
      if (mode !== '2d') return null
      const fg = fgRef.current
      const canvas = containerRef.current?.querySelector('canvas')
      if (!fg || !canvas) return null

      const rect = canvas.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null

      const { x, y } = fg.screen2GraphCoords(sx, sy)
      const scale = Math.max(fg.zoom(), 0.15)
      const pad = HIT_PADDING_PX / scale

      let best: SimNode | null = null
      let bestDist = Infinity
      for (const node of nodesRef.current) {
        const pos = posRef.current.get(node.id)
        if (!pos) continue
        const dist = Math.hypot(pos.x - x, pos.y - y)
        const hitR = (node.size ?? 4.5) + pad
        if (dist <= hitR && dist < bestDist) {
          bestDist = dist
          best = node
        }
      }
      return best
    },
    [mode],
  )

  // Own click handling — force-graph's onBackgroundClick marks any slight
  // pointermove as a drag and suppresses clicks; node drag also steals them.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (mode !== '2d') return

    let down: { x: number; y: number } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      down = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      // Pan/zoom gestures move further than this; ignore those.
      if (moved > CLICK_MOVE_TOLERANCE_PX) return
      onSelectRef.current(nodeAtClient(event.clientX, event.clientY))
    }

    const onPointerCancel = () => {
      down = null
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerCancel)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [nodeAtClient, mode])

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as SimNode
      if (n.x != null && n.y != null) {
        posRef.current.set(n.id, { x: n.x, y: n.y })
      }
      const isSelected = n.id === selectedId
      const radius = (n.size ?? 4.5) * (isSelected ? 1.25 : 1)
      const label = n.label
      const fontSize = Math.max(10 / globalScale, 2.4)

      if (isSelected || radius > 7) {
        ctx.beginPath()
        ctx.arc(n.x ?? 0, n.y ?? 0, radius + 2.5, 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(n.color, isSelected ? 0.22 : 0.12)
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fillStyle = n.color
      ctx.fill()

      if (isSelected) {
        ctx.strokeStyle = palette.selectedStroke
        ctx.lineWidth = 1.8 / globalScale
        ctx.stroke()
      }

      if (globalScale > 1.15 || isSelected) {
        ctx.font = `500 ${fontSize}px "DM Sans", system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = palette.label
        ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + radius + 1.5)
      }
    },
    [selectedId, palette],
  )

  return (
    <div className="graph-canvas" ref={containerRef}>
      {size.width > 0 && (
        mode === '3d' ? (
          <Suspense fallback={<div className="graph-loading">Loading 3D graph...</div>}>
            <ForceGraph3D
              ref={fg3dRef}
              width={size.width}
              height={size.height}
              graphData={graphData}
              nodeId="id"
              linkSource="source"
            linkTarget="target"
            backgroundColor={palette.background}
            nodeRelSize={3}
            nodeVal={(node) => (node as SimNode3D).size}
              nodeColor={(node) => (node as SimNode3D).color}
              nodeLabel={(node) => (node as SimNode3D).title}
              linkLabel={(link) => (link as FGLink3D).label}
              linkColor={(link) =>
                (link as GraphLink).color || palette.linkFallback
              }
              linkWidth={(link) =>
                (link as GraphLink).kind === 'spine' ? 0.45 : 0.85
              }
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              enableNodeDrag={false}
              enablePointerInteraction
              onNodeClick={(node) => onSelect(node as GraphNode)}
              onBackgroundClick={() => onSelect(null)}
              onEngineTick={capture3dPositions}
              cooldownTicks={220}
              d3VelocityDecay={0.35}
            />
          </Suspense>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            backgroundColor={palette.background}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            linkColor={(link) =>
              (link as GraphLink).color || palette.linkFallback
            }
            linkWidth={(link) =>
              (link as GraphLink).kind === 'spine' ? 0.45 : 0.85
            }
            linkDirectionalArrowLength={2.8}
            linkDirectionalArrowRelPos={1}
            enableNodeDrag={false}
            enablePointerInteraction={false}
            cooldownTicks={220}
            d3VelocityDecay={0.35}
          />
        )
      )}
    </div>
  )
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return hex
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

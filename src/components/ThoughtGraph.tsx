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
import {
  CANVAS,
  colorizeGraph,
  linkDashForKind,
  linkWidthForKind,
} from '../theme/palette'
import type { GraphData, GraphLink, GraphMode, GraphNode } from '../types'

const ForceGraph3D = lazy(() => import('react-force-graph-3d'))

interface ThoughtGraphProps {
  data: GraphData
  selectedId: string | null
  /** Full-graph neighborhood for selection dimming; null when nothing selected. */
  neighborIds: Set<string> | null
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

/** Max pointer travel (px) still counted as a click, not a pan. */
const CLICK_MOVE_TOLERANCE_PX = 6
/** Extra screen-space radius (px) around each node for easier targeting. */
const HIT_PADDING_PX = 12
/** Minimum graph-space gap between rendered node circles. */
const NODE_GAP = 4

function resolveLinkEnd(ref: string | { id?: string } | undefined): string {
  if (typeof ref === 'string') return ref
  return ref?.id ?? ''
}

export function ThoughtGraph({
  data,
  selectedId,
  neighborIds,
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
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const palette = CANVAS[theme]

  const themedData = useMemo(() => colorizeGraph(data, theme), [data, theme])

  // Preserve simulation positions across data refreshes.
  const graphData = useMemo(() => {
    if (lastResetKeyRef.current !== resetKey) {
      posRef.current.clear()
      lastResetKeyRef.current = resetKey
    }

    const nodes = themedData.nodes.map((n) => {
      const pos = posRef.current.get(n.id)
      return pos ? { ...n, ...pos } : ({ ...n } as SimNode)
    }) as SimNode[]

    nodesRef.current = nodes
    return {
      nodes,
      links: themedData.links.map((l) => ({ ...l })),
    }
  }, [themedData, resetKey])

  // Keep node circles apart. Lazy 3D may mount after this effect first runs,
  // so retry briefly until the engine ref is available.
  useEffect(() => {
    let cancelled = false
    let tries = 0

    const attach = () => {
      if (cancelled) return
      const fg = mode === '3d' ? fg3dRef.current : fgRef.current
      if (!fg) {
        if (tries++ < 90) requestAnimationFrame(attach)
        return
      }
      const collision = forceCollide<SimNode>((node) =>
        (node.size ?? 4.5) * 1.25 + NODE_GAP,
      ).iterations(4)
      fg.d3Force('collide', collision)
      fg.d3ReheatSimulation()
    }

    attach()
    return () => {
      cancelled = true
    }
  }, [graphData, mode])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      const width = Math.floor(rect.width)
      const height = Math.floor(rect.height)
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Track whether the current gesture started on a node so pan cannot steal clicks.
  const pointerOnNodeRef = useRef(false)

  const capture3dPositions = useCallback(() => {
    for (const node of graphData.nodes) {
      if (node.x != null && node.y != null && node.z != null) {
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

  // Own click + hover handling — force-graph's pointer interaction fights pans.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (mode !== '2d') return

    let down: { x: number; y: number; onNode: boolean } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const hit = nodeAtClient(event.clientX, event.clientY)
      pointerOnNodeRef.current = Boolean(hit)
      down = {
        x: event.clientX,
        y: event.clientY,
        onNode: Boolean(hit),
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      const startedOnNode = down.onNode
      down = null
      pointerOnNodeRef.current = false
      // Pan/zoom gestures move further than this; ignore those.
      // Always accept a click that started on a node (pan is disabled there).
      if (!startedOnNode && moved > CLICK_MOVE_TOLERANCE_PX) return
      onSelectRef.current(nodeAtClient(event.clientX, event.clientY))
    }

    const onPointerMove = (event: PointerEvent) => {
      const hit = nodeAtClient(event.clientX, event.clientY)
      setHoveredId(hit?.id ?? null)
    }

    const onPointerLeave = () => {
      setHoveredId(null)
    }

    const onPointerCancel = () => {
      down = null
      pointerOnNodeRef.current = false
    }

    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('pointercancel', onPointerCancel)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [nodeAtClient, mode])

  const allowPan = useCallback((event: MouseEvent | TouchEvent) => {
    // Block pan while interacting with a node so selection never shifts the camera.
    if (pointerOnNodeRef.current) return false
    if ('clientX' in event) {
      return nodeAtClient(event.clientX, event.clientY) == null
    }
    const touch = event.touches[0] ?? event.changedTouches[0]
    if (!touch) return true
    return nodeAtClient(touch.clientX, touch.clientY) == null
  }, [nodeAtClient])

  const isDimmed = useCallback(
    (id: string) => Boolean(neighborIds && !neighborIds.has(id)),
    [neighborIds],
  )

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as SimNode
      if (n.x != null && n.y != null) {
        posRef.current.set(n.id, { x: n.x, y: n.y })
      }
      const isSelected = n.id === selectedId
      const isHovered = n.id === hoveredId
      const dimmed = isDimmed(n.id)
      const radius = (n.size ?? 4.5) * (isSelected ? 1.22 : isHovered ? 1.1 : 1)
      const label = isSelected ? `${n.label}` : n.label
      const fontSize = Math.max(9.5 / globalScale, 2.2)
      const fill = dimmed ? withAlpha(n.color, palette.dimOpacity) : n.color

      if (isSelected || isHovered || radius > 7) {
        ctx.beginPath()
        ctx.arc(n.x ?? 0, n.y ?? 0, radius + (isSelected ? 3.2 : 2.2), 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(
          n.color,
          isSelected
            ? palette.haloSelected
            : isHovered
              ? palette.haloSelected * 0.7
              : palette.haloLarge,
        )
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fillStyle = fill
      ctx.fill()

      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected
          ? palette.selectedStroke
          : withAlpha(palette.selectedStroke, 0.55)
        ctx.lineWidth = (isSelected ? 1.6 : 1.2) / globalScale
        ctx.stroke()
      }

      if (globalScale > 1.15 || isSelected) {
        const fontSpec = palette.labelFont.replace(
          '1em',
          `${fontSize}px`,
        )
        ctx.font = fontSpec
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = dimmed
          ? withAlpha(palette.label, palette.dimOpacity)
          : palette.label
        ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + radius + 1.5)
        if (isSelected && n.title && globalScale > 0.9) {
          const titleSize = Math.max(8.5 / globalScale, 2)
          ctx.font = palette.labelFont.replace('1em', `${titleSize}px`)
          ctx.fillStyle = withAlpha(palette.label, 0.75)
          const title =
            n.title.length > 42 ? `${n.title.slice(0, 40)}…` : n.title
          ctx.fillText(title, n.x ?? 0, (n.y ?? 0) + radius + fontSize + 2.2)
        }
      }
    },
    [selectedId, hoveredId, palette, isDimmed],
  )

  const resolveLinkStyle = useCallback(
    (link: object) => {
      const l = link as GraphLink
      const source = resolveLinkEnd(l.source)
      const target = resolveLinkEnd(l.target)
      const base = l.color || palette.linkFallback
      const dimmed =
        Boolean(neighborIds) &&
        !neighborIds!.has(source) &&
        !neighborIds!.has(target)
      return {
        color: dimmed ? withAlpha(base, palette.dimOpacity * 0.85) : base,
        width: linkWidthForKind(l.kind),
        dash: linkDashForKind(l.kind),
      }
    },
    [neighborIds, palette],
  )

  return (
    <div
      className={`graph-canvas${hoveredId ? ' is-hovering-node' : ''}`}
      ref={containerRef}
    >
      {size.width > 0 &&
        (mode === '3d' ? (
          <Suspense
            fallback={<div className="graph-loading">Loading 3D graph…</div>}
          >
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
              nodeColor={(node) => {
                const n = node as SimNode3D
                return isDimmed(n.id)
                  ? withAlpha(n.color, palette.dimOpacity)
                  : n.color
              }}
              nodeLabel={(node) => (node as SimNode3D).title}
              linkLabel={(link) => (link as FGLink3D).label}
              linkColor={(link) => resolveLinkStyle(link).color}
              linkWidth={(link) => resolveLinkStyle(link).width}
              linkDirectionalArrowLength={3.2}
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
            linkColor={(link) => resolveLinkStyle(link).color}
            linkWidth={(link) => resolveLinkStyle(link).width}
            linkLineDash={(link) => resolveLinkStyle(link).dash}
            linkDirectionalArrowLength={(link) =>
              (link as GraphLink).kind === 'spine' ? 1.6 : 2.6
            }
            linkDirectionalArrowRelPos={1}
            enableNodeDrag={false}
            enablePointerInteraction={false}
            enablePanInteraction={allowPan}
            cooldownTicks={220}
            d3VelocityDecay={0.35}
          />
        ))}
    </div>
  )
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba')) {
    return color.replace(
      /rgba\(([^)]+)\)/,
      (_, inner: string) => {
        const parts = inner.split(',').map((p) => p.trim())
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
      },
    )
  }
  if (color.startsWith('rgb(')) {
    const inner = color.slice(4, -1)
    return `rgba(${inner}, ${alpha})`
  }
  const raw = color.replace('#', '')
  if (raw.length !== 6) return color
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

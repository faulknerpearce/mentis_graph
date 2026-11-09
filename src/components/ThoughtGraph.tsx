import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { forceCenter, forceCollide, forceX, forceY } from 'd3-force-3d'
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d'
import type { ForceGraphMethods as ForceGraph3DMethods } from 'react-force-graph-3d'
import type { Theme } from '../hooks/useTheme'
import { linkEnd } from '../graph/buildGraph'
import { TIMELINE_NODE_SIZE, type TimelineLayout } from '../graph/timeline'
import { formatDate } from '../lib/format'
import { CANVAS, CONTESTED_RING, linkDash, linkWidth, withAlpha } from '../theme/palette'
import type { GraphLink, GraphMode, LayoutMode, MapData, MapNode } from '../types'
import { Icon } from './Icon'

const ForceGraph3D = lazy(() => import('react-force-graph-3d'))

export interface FocusRequest {
  id: string
  nonce: number
}

interface ThoughtGraphProps {
  data: MapData
  layout: LayoutMode
  /** Lane and time scale for the timeline layout; null in the others. */
  timeline: TimelineLayout | null
  selectedId: string | null
  /** Nodes outside this set are dimmed; null dims nothing. */
  highlight: Set<string> | null
  theme: Theme
  mode: GraphMode
  resetKey: number
  focus: FocusRequest | null
  onSelect: (node: MapNode | null) => void
}

type SimNode = MapNode & NodeObject & { z?: number }
// The library cannot infer a node union, so it sees plain node objects and
// callbacks cast back to SimNode.
type FGData = { nodes: NodeObject[]; links: LinkObject[] }
type Position = { x: number; y: number; z?: number }
type Hover = { node: MapNode; x: number; y: number }

interface TunableForce {
  strength?: (value: number | ((item: never) => number)) => TunableForce
  distance?: (value: number | ((item: never) => number)) => TunableForce
  distanceMax?: (value: number) => TunableForce
}

/** Max pointer travel (px) still counted as a click, not a pan. */
const CLICK_MOVE_TOLERANCE_PX = 6
/** Extra screen-space radius (px) around each node for easier targeting. */
const HIT_PADDING_PX = 12
/** Minimum graph-space gap between rendered node circles. */
const NODE_GAP = 8
/** Links of the selected thought: near-opaque and this many times wider. */
const SELECTED_LINK_ALPHA = 0.95
const SELECTED_LINK_WIDTH = 2.6
/** Zoom level above which thought labels are drawn. */
const LABEL_ZOOM = 1.15
const TOPIC_LABEL_ZOOM = 0.7
/**
 * Simulation timing per layout. The network settles quickly; the topic map
 * cools slowly so every thought has time to reach its topic hub.
 */
const COOLING: Record<LayoutMode, { velocityDecay: number; alphaDecay: number; ticks: number }> = {
  network: { velocityDecay: 0.35, alphaDecay: 0.0228, ticks: 220 },
  topics: { velocityDecay: 0.45, alphaDecay: 0.011, ticks: 640 },
  timeline: { velocityDecay: 0.6, alphaDecay: 0.1, ticks: 30 },
}

/**
 * The topic map gathers each thought round its topic hub; references never
 * pull because there are too many of them.
 */
const TOPIC_PHYSICS = {
  links: { session: [16, 0.2], lineage: [40, 0.1], reasoning: [40, 0.1], reference: [60, 0], sequence: [30, 0.1], topic: [18, 1] },
  charge: { topic: -2500, thought: -10, range: 180 },
  pull: 0.012,
} as const

/** Network forces: d3's defaults, loosened a little so nodes have room. */
const NETWORK_CHARGE = -45
const NETWORK_LINK_DISTANCE = 40

/** Screen-space gap between lane labels and the filter panel (or edge). */
const LANE_LABEL_INSET_PX = 14

export function ThoughtGraph({
  data,
  layout,
  timeline,
  selectedId,
  highlight,
  theme,
  mode,
  resetKey,
  focus,
  onSelect,
}: ThoughtGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined)
  const fg3dRef = useRef<ForceGraph3DMethods | undefined>(undefined)
  // Rendered positions keyed by node id, captured during paint, so hit-testing
  // and data refreshes never depend on the library's internal node objects.
  const posRef = useRef(new Map<string, Position>())
  const nodesRef = useRef<SimNode[]>([])
  const lastResetKeyRef = useRef(resetKey)
  const needsFitRef = useRef(true)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<Hover | null>(null)
  const palette = CANVAS[theme]
  const cooling = COOLING[layout]
  const hoveredId = hover?.node.id ?? null

  // Preserve simulation positions across data refreshes.
  const graphData = useMemo(() => {
    if (lastResetKeyRef.current !== resetKey) {
      posRef.current.clear()
      lastResetKeyRef.current = resetKey
      needsFitRef.current = true
    }
    const nodes = data.nodes.map((n) => {
      const pos = posRef.current.get(n.id)
      const node = (pos ? { ...n, ...pos } : { ...n }) as SimNode
      // The timeline pins every thought to its slot in its day's stack.
      const slot = timeline && n.kind === 'thought' ? timeline.positions.get(n.id) : undefined
      if (slot) {
        node.x = node.fx = slot.x
        node.y = node.fy = slot.y
        node.size = TIMELINE_NODE_SIZE
      }
      return node
    })
    nodesRef.current = nodes
    return { nodes, links: data.links.map((l) => ({ ...l })) }
  }, [data, resetKey, timeline])

  // Degree per node, for d3's default link strength in the network layout.
  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const link of data.links) {
      for (const end of [linkEnd(link.source), linkEnd(link.target)]) {
        counts.set(end, (counts.get(end) ?? 0) + 1)
      }
    }
    return counts
  }, [data.links])
  const linkCountsRef = useRef(linkCounts)
  linkCountsRef.current = linkCounts

  // Shape the layout. Lazy 3D may mount after this effect first runs, so
  // retry briefly until the engine ref is available.
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
      const charge = fg.d3Force('charge') as unknown as TunableForce | undefined
      const link = fg.d3Force('link') as unknown as TunableForce | undefined

      if (layout === 'timeline') {
        // Every thought is pinned, so no force needs to move anything.
        fg.d3Force('center', null)
        fg.d3Force('x', null)
        fg.d3Force('y', null)
        charge?.strength?.(0)
        link?.strength?.(0)
      } else if (layout === 'topics') {
        fg.d3Force('center', null)
        fg.d3Force('x', forceX<NodeObject>(0).strength(TOPIC_PHYSICS.pull))
        fg.d3Force('y', forceY<NodeObject>(0).strength(TOPIC_PHYSICS.pull))
        charge?.strength?.((n: SimNode) =>
          n.kind === 'topic' ? TOPIC_PHYSICS.charge.topic : TOPIC_PHYSICS.charge.thought,
        )
        charge?.distanceMax?.(TOPIC_PHYSICS.charge.range)
        link?.distance?.((l: GraphLink) => TOPIC_PHYSICS.links[l.category][0])
        link?.strength?.((l: GraphLink) => TOPIC_PHYSICS.links[l.category][1])
      } else {
        fg.d3Force('x', null)
        fg.d3Force('y', null)
        fg.d3Force('center', forceCenter())
        charge?.strength?.(NETWORK_CHARGE)
        charge?.distanceMax?.(Infinity)
        link?.distance?.(NETWORK_LINK_DISTANCE)
        link?.strength?.((l: GraphLink) => {
          const counts = linkCountsRef.current
          return (
            1 /
            Math.max(
              1,
              Math.min(counts.get(linkEnd(l.source)) ?? 1, counts.get(linkEnd(l.target)) ?? 1),
            )
          )
        })
      }
      // The network and timeline keep thoughts well apart; the topic map packs
      // them more tightly round their hubs.
      const collide =
        layout === 'topics'
          ? forceCollide<NodeObject>((node) => {
              const n = node as SimNode
              return n.size + (n.kind === 'topic' ? 18 : 8)
            }).iterations(2)
          : forceCollide<NodeObject>((node) => (node as SimNode).size * 1.25 + NODE_GAP).iterations(4)
      fg.d3Force('collide', layout === 'timeline' ? null : collide)
      fg.d3ReheatSimulation()
    }

    attach()
    return () => {
      cancelled = true
    }
  }, [graphData, mode, layout, timeline])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const width = Math.floor(rect.width)
      const height = Math.floor(rect.height)
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!focus) return
    const pos = posRef.current.get(focus.id)
    if (!pos) return
    if (mode === '2d') {
      const fg = fgRef.current
      fg?.centerAt(pos.x, pos.y, 950)
      fg?.zoom(Math.max(fg.zoom(), 2.4), 950)
      return
    }
    const fg = fg3dRef.current
    if (!fg) return
    const z = pos.z ?? 0
    const ratio = 1 + 160 / Math.max(Math.hypot(pos.x, pos.y, z), 1)
    fg.cameraPosition({ x: pos.x * ratio, y: pos.y * ratio, z: z * ratio }, { x: pos.x, y: pos.y, z }, 900)
  }, [focus, mode])

  // Track whether the current gesture started on a node so pan cannot steal clicks.
  const pointerOnNodeRef = useRef(false)

  const nodeAtClient = useCallback(
    (clientX: number, clientY: number): SimNode | null => {
      if (mode !== '2d') return null
      const fg = fgRef.current
      const canvas = containerRef.current?.querySelector('canvas')
      if (!fg || !canvas) return null

      const rect = canvas.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null

      const { x, y } = fg.screen2GraphCoords(sx, sy)
      const pad = HIT_PADDING_PX / Math.max(fg.zoom(), 0.15)
      let best: SimNode | null = null
      let bestDist = Infinity
      for (const node of nodesRef.current) {
        const pos = posRef.current.get(node.id)
        if (!pos) continue
        const dist = Math.hypot(pos.x - x, pos.y - y)
        if (dist <= node.size + pad && dist < bestDist) {
          bestDist = dist
          best = node
        }
      }
      return best
    },
    [mode],
  )

  // Own click + hover handling: force-graph's pointer interaction fights pans.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mode !== '2d') return

    let down: { x: number; y: number; onNode: boolean } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const onNode = Boolean(nodeAtClient(event.clientX, event.clientY))
      pointerOnNodeRef.current = onNode
      down = { x: event.clientX, y: event.clientY, onNode }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || !down) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      const startedOnNode = down.onNode
      down = null
      pointerOnNodeRef.current = false
      if (!startedOnNode && moved > CLICK_MOVE_TOLERANCE_PX) return
      onSelectRef.current(nodeAtClient(event.clientX, event.clientY))
    }

    const onPointerMove = (event: PointerEvent) => {
      if (down && !down.onNode) return
      const node = nodeAtClient(event.clientX, event.clientY)
      const rect = el.getBoundingClientRect()
      setHover(node ? { node, x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
    }

    const onPointerLeave = () => setHover(null)
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

  const allowPan = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // Block pan while interacting with a node so selection never shifts the camera.
      if (pointerOnNodeRef.current) return false
      const point = 'clientX' in event ? event : (event.touches[0] ?? event.changedTouches[0])
      if (!point) return true
      return nodeAtClient(point.clientX, point.clientY) == null
    },
    [nodeAtClient],
  )

  const isDimmed = useCallback(
    (id: string) => Boolean(highlight && !highlight.has(id)),
    [highlight],
  )

  const font = useCallback(
    (px: number) => palette.labelFont.replace('1em', `${px}px`),
    [palette],
  )

  const paintNode = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, scale: number) => {
      const n = node as SimNode
      const x = n.x ?? 0
      const y = n.y ?? 0
      posRef.current.set(n.id, { x, y })

      const selected = n.id === selectedId
      const hovered = n.id === hoveredId
      const dimmed = isDimmed(n.id)
      const fontSize = Math.max(9.5 / scale, 2.2)

      if (n.kind === 'topic') {
        const alpha = dimmed ? palette.dimOpacity : 1
        ctx.beginPath()
        ctx.arc(x, y, n.size, 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(palette.topicFill, alpha)
        ctx.fill()
        ctx.lineWidth = (selected || hovered ? 1.6 : 1) / scale
        ctx.strokeStyle = withAlpha(n.color, alpha)
        ctx.stroke()
        if (scale >= TOPIC_LABEL_ZOOM || selected) {
          ctx.font = font(Math.max(11 / scale, 2.6))
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = withAlpha(palette.label, alpha)
          ctx.fillText(n.title, x, y)
        }
        return
      }

      const retired = n.status === 'retired'
      const radius = n.size * (selected ? 1.22 : hovered ? 1.1 : 1)
      const baseAlpha = retired ? 0.6 : 1
      const alpha = dimmed ? palette.dimOpacity * baseAlpha : baseAlpha

      if (n.versions.length > 0 && !retired) {
        // Offset rings behind the node: earlier versions folded into it.
        const layers = Math.min(2, n.versions.length)
        for (let i = layers; i >= 1; i--) {
          ctx.beginPath()
          ctx.arc(x + i * radius * 0.3, y - i * radius * 0.3, radius, 0, 2 * Math.PI)
          ctx.lineWidth = Math.max(0.5, radius * 0.12)
          ctx.strokeStyle = withAlpha(n.color, alpha)
          ctx.stroke()
        }
      }

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      if (retired) {
        ctx.setLineDash([1.6, 1.4])
        ctx.lineWidth = Math.max(0.8, radius * 0.28)
        ctx.strokeStyle = withAlpha(n.color, alpha)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = withAlpha(n.color, alpha)
        ctx.fill()
      }

      if (n.status === 'contested' && !dimmed) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 1.6, 0, 2 * Math.PI)
        ctx.lineWidth = 0.9
        ctx.strokeStyle = withAlpha(CONTESTED_RING[theme], 0.9)
        ctx.stroke()
      }

      if (selected || hovered) {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        ctx.strokeStyle = selected ? palette.selectedStroke : withAlpha(palette.selectedStroke, 0.55)
        ctx.lineWidth = (selected ? 1.6 : 1.2) / scale
        ctx.stroke()
      }

      // Timeline stacks are too dense for labels on every thought.
      if (selected || (layout !== 'timeline' && scale > LABEL_ZOOM)) {
        ctx.font = font(fontSize)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = dimmed ? withAlpha(palette.label, palette.dimOpacity) : palette.label
        ctx.fillText(`#${n.index} · ${n.thoughtType}`, x, y + radius + 1.5)
      }
    },
    [selectedId, hoveredId, isDimmed, palette, theme, font, layout],
  )

  const touchesSelected = useCallback(
    (l: GraphLink) =>
      selectedId != null && (linkEnd(l.source) === selectedId || linkEnd(l.target) === selectedId),
    [selectedId],
  )

  /**
   * With a thought selected, its own links are drawn solid, strong and wide
   * and every other link recedes. Otherwise links outside the highlight dim.
   */
  const resolveLinkStyle = useCallback(
    (link: object) => {
      const l = link as GraphLink
      if (touchesSelected(l)) {
        return {
          color: withAlpha(l.color, SELECTED_LINK_ALPHA),
          width: linkWidth(l.category) * SELECTED_LINK_WIDTH,
          dash: null,
        }
      }
      const dimmed = selectedId
        ? true
        : Boolean(highlight) && !highlight!.has(linkEnd(l.source)) && !highlight!.has(linkEnd(l.target))
      return {
        color: dimmed ? withAlpha(l.color, palette.dimOpacity * 0.85) : l.color,
        width: linkWidth(l.category),
        dash: linkDash(l.category),
      }
    },
    [highlight, palette, selectedId, touchesSelected],
  )

  /** Lane bands and month gridlines, drawn beneath the nodes. */
  const paintLanes = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      if (!timeline) return
      const { left, right, top, bottom } = timeline
      ctx.save()
      let shade = false
      for (const lane of timeline.lanes.values()) {
        if (shade) {
          ctx.fillStyle = withAlpha(palette.label, 0.035)
          ctx.fillRect(left - 40, lane.y - lane.height / 2 - 13, right - left + 80, lane.height + 26)
        }
        shade = !shade
      }
      ctx.strokeStyle = withAlpha(palette.label, 0.12)
      ctx.lineWidth = 1 / scale
      ctx.setLineDash([4 / scale, 6 / scale])
      for (const tick of timeline.ticks) {
        ctx.beginPath()
        ctx.moveTo(tick.x, top - 24)
        ctx.lineTo(tick.x, bottom + 12)
        ctx.stroke()
      }
      ctx.restore()
    },
    [timeline, palette],
  )

  /**
   * Chain names at the top left of each lane, kept clear of the filter panel
   * as you pan, and month labels along the top.
   */
  const paintLaneLabels = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      if (!timeline) return
      const fg = fgRef.current
      const canvas = containerRef.current?.querySelector('canvas')
      const panel = document.querySelector('.filter-panel')
      let insetPx = LANE_LABEL_INSET_PX
      if (canvas && panel) {
        insetPx += Math.max(0, panel.getBoundingClientRect().right - canvas.getBoundingClientRect().left)
      }
      const visibleLeft = fg ? fg.screen2GraphCoords(insetPx, 0).x : timeline.left
      const labelX = Math.max(timeline.left - 34, visibleLeft)
      const px = Math.max(11 / scale, 3)
      ctx.save()
      ctx.font = palette.labelFont.replace('1em', `${px}px`).replace('500', '600')
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3 / scale
      ctx.strokeStyle = withAlpha(palette.background, 0.85)
      ctx.fillStyle = palette.label
      for (const lane of timeline.lanes.values()) {
        const y = lane.y - lane.height / 2 - 2
        ctx.strokeText(lane.chain, labelX, y)
        ctx.fillText(lane.chain, labelX, y)
      }
      ctx.font = palette.labelFont.replace('1em', `${Math.max(10 / scale, 2.6)}px`)
      ctx.fillStyle = withAlpha(palette.label, 0.75)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      for (const tick of timeline.ticks) {
        ctx.fillText(tick.label, tick.x, timeline.top - 28)
      }
      ctx.restore()
    },
    [timeline, palette],
  )

  const fitView = useCallback(
    (ms: number) => {
      if (mode === '2d') fgRef.current?.zoomToFit(ms, timeline ? 110 : 60)
      else fg3dRef.current?.zoomToFit(ms, 60)
    },
    [mode, timeline],
  )

  const handleEngineStop = useCallback(() => {
    if (!needsFitRef.current) return
    needsFitRef.current = false
    fitView(900)
  }, [fitView])

  const zoomBy = (factor: number) => {
    const fg = fgRef.current
    if (mode === '2d' && fg) fg.zoom(fg.zoom() * factor, 450)
  }

  return (
    <div className={`graph-canvas${hover ? ' is-hovering-node' : ''}`} ref={containerRef}>
      {size.width > 0 &&
        (mode === '3d' ? (
          <Suspense fallback={<div className="graph-loading">Loading 3D graph…</div>}>
            <ForceGraph3D
              ref={fg3dRef}
              width={size.width}
              height={size.height}
              graphData={graphData}
              nodeId="id"
              backgroundColor={palette.background}
              showNavInfo={false}
              nodeRelSize={3}
              nodeVal={(node) => (node as SimNode).size}
              nodeColor={(node) => {
                const n = node as SimNode
                if (isDimmed(n.id)) return withAlpha(n.color, palette.dimOpacity)
                if (n.kind === 'thought' && n.status === 'retired') return withAlpha(n.color, 0.4)
                return n.color
              }}
              nodeLabel={(node) => tooltipHtml(node as SimNode)}
              linkColor={(link) => resolveLinkStyle(link).color}
              linkWidth={(link) => resolveLinkStyle(link).width}
              linkDirectionalArrowLength={3.2}
              linkDirectionalArrowRelPos={1}
              enableNodeDrag={false}
              onNodeClick={(node) => onSelect(node as SimNode)}
              onBackgroundClick={() => onSelect(null)}
              onEngineTick={() => {
                for (const n of graphData.nodes) {
                  if (n.x != null && n.y != null) {
                    posRef.current.set(n.id, { x: n.x, y: n.y, z: n.z ?? 0 })
                  }
                }
              }}
              onEngineStop={handleEngineStop}
              cooldownTicks={cooling.ticks}
              d3VelocityDecay={cooling.velocityDecay}
              d3AlphaDecay={cooling.alphaDecay}
            />
          </Suspense>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData as FGData}
            nodeId="id"
            backgroundColor={palette.background}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            onRenderFramePre={paintLanes}
            onRenderFramePost={paintLaneLabels}
            linkColor={(link) => resolveLinkStyle(link).color}
            linkWidth={(link) => resolveLinkStyle(link).width}
            linkLineDash={(link) => resolveLinkStyle(link).dash}
            linkDirectionalArrowLength={(link) => {
              const l = link as GraphLink
              if (l.category === 'topic') return 0
              if (touchesSelected(l)) return 4.2
              return l.category === 'sequence' ? 1.6 : 2.6
            }}
            linkDirectionalArrowRelPos={1}
            enableNodeDrag={false}
            enablePointerInteraction={false}
            enablePanInteraction={allowPan}
            onEngineStop={handleEngineStop}
            cooldownTicks={cooling.ticks}
            d3VelocityDecay={cooling.velocityDecay}
            d3AlphaDecay={cooling.alphaDecay}
            minZoom={0.05}
            maxZoom={12}
          />
        ))}

      {hover && mode === '2d' && (
        <div
          className="hover-card"
          style={{
            transform: `translate(${Math.min(hover.x + 16, size.width - 300)}px, ${hover.y + 16}px)`,
          }}
        >
          <HoverCard node={hover.node} />
        </div>
      )}

      <div className="zoom-controls glass">
        {mode === '2d' && (
          <>
            <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in" title="Zoom in">
              <Icon name="plus" />
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out" title="Zoom out">
              <Icon name="minus" />
            </button>
          </>
        )}
        <button type="button" onClick={() => fitView(900)} aria-label="Fit to screen" title="Fit to screen">
          <Icon name="fit" />
        </button>
      </div>
    </div>
  )
}

function HoverCard({ node }: { node: MapNode }) {
  if (node.kind === 'topic') {
    return (
      <>
        <div className="hover-card-meta">Topic</div>
        <div className="hover-card-title">{node.title}</div>
        <div className="hover-card-foot">
          {node.count} memories · {node.chains.length} {node.chains.length === 1 ? 'chain' : 'chains'}
        </div>
      </>
    )
  }
  return (
    <>
      <div className="hover-card-meta">
        <span className="dot" style={{ background: node.color }} />
        {node.thoughtType}
        <span className="sep">·</span>
        {node.chainKey} #{node.index}
      </div>
      <div className="hover-card-title">{node.title}</div>
      <div className="hover-card-foot">
        {node.agent} · {formatDate(node.time)}
        {node.versions.length > 0 && <span className="status-chip versions">v{node.versions.length + 1}</span>}
        {node.status !== 'live' && <span className={`status-chip ${node.status}`}>{node.status}</span>}
      </div>
    </>
  )
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function tooltipHtml(node: MapNode): string {
  const meta = node.kind === 'topic' ? `Topic · ${node.count} memories` : `${node.thoughtType} · ${node.chainKey} #${node.index}`
  return `<div class="hover-card in-3d"><div class="hover-card-meta">${escapeHtml(meta)}</div><div class="hover-card-title">${escapeHtml(node.title)}</div></div>`
}

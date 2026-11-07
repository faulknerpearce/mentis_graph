import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { forceCollide, forceX, forceY, forceZ } from 'd3-force-3d'
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d'
import type { ForceGraphMethods as ForceGraph3DMethods } from 'react-force-graph-3d'
import type { Theme } from '../hooks/useTheme'
import { linkEnd } from '../graph/buildGraph'
import type { Anchor } from '../graph/layout'
import { formatDate } from '../lib/format'
import { CANVAS, CONTESTED_RING, linkWidth, withAlpha } from '../theme/palette'
import type {
  EdgeCategory,
  GraphLink,
  GraphMode,
  LayoutMode,
  MapData,
  MapNode,
} from '../types'
import { Icon } from './Icon'

const ForceGraph3D = lazy(() => import('react-force-graph-3d'))

export interface FocusRequest {
  id: string
  nonce: number
}

interface ThoughtGraphProps {
  data: MapData
  layout: LayoutMode
  anchors: Map<string, Anchor>
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

type Physics = {
  links: Record<EdgeCategory, { distance: number; strength: number }>
  charge: { topic: number; thought: number; range: number }
}

/**
 * How tightly each kind of connection holds thoughts together, per layout.
 * References are drawn but never pull: there are too many of them, and they
 * collapse any structure into a hairball. Values were tuned by simulating the
 * real MentisDB data offline and measuring how close thoughts settle to their
 * own topic compared with a random one.
 */
const PHYSICS: Record<LayoutMode, Physics> = {
  // Each thought gathers tightly round its topic; sessions shape the inside
  // of a cluster without dragging thoughts out of it.
  topics: {
    links: {
      session: { distance: 16, strength: 0.2 },
      lineage: { distance: 40, strength: 0.1 },
      reasoning: { distance: 40, strength: 0.1 },
      reference: { distance: 60, strength: 0 },
      sequence: { distance: 30, strength: 0.1 },
      topic: { distance: 18, strength: 1 },
    },
    charge: { topic: -2500, thought: -10, range: 180 },
  },
  // No topics here, so sessions and relations are the bonds that form shapes.
  chains: {
    links: {
      session: { distance: 14, strength: 0.7 },
      lineage: { distance: 36, strength: 0.3 },
      reasoning: { distance: 36, strength: 0.3 },
      reference: { distance: 60, strength: 0 },
      sequence: { distance: 30, strength: 0.12 },
      topic: { distance: 30, strength: 0 },
    },
    charge: { topic: 0, thought: -30, range: 300 },
  },
}

/**
 * Line strength per layout, relative to the palette. In the topic map, links
 * that cut across clusters recede so the cluster shapes read first; they come
 * back at full strength around a selected thought.
 */
const LINK_EMPHASIS: Record<LayoutMode, Partial<Record<EdgeCategory, number>>> = {
  topics: { reference: 0.45, session: 0.35, sequence: 0.4, topic: 1.8 },
  chains: {},
}

/** Zoom level at which each kind of label appears. */
const LABEL_ZOOM = { topic: 0.7, focus: 1.6, thought: 2.4 }
/** Region labels fade out once you are zoomed into the detail. */
const CHAIN_LABEL_MAX_ZOOM = 2.2
const MIN_LABELLED_CHAIN = 5

const CLICK_MOVE_TOLERANCE_PX = 6
const HIT_PADDING_PX = 8
const ANCHOR_PULL = 0.02
const CENTER_PULL = 0.012
const FONT = '"Geist", "Inter", system-ui, sans-serif'
/** Duration of the dim/undim crossfade when the highlight changes. */
const FADE_MS = 260
/**
 * High damping keeps motion gliding rather than wobbling; a slow cool-down
 * lets you watch the structure form (about ten seconds on load).
 */
const VELOCITY_DECAY = 0.45
const ALPHA_DECAY = 0.011
const COOLDOWN_TICKS = 640
const COOLDOWN_MS = 40000
/** Frame on the forming layout early, then again once it settles. */
const EARLY_FIT_TICK = 45

const easeOut = (t: number) => 1 - (1 - t) ** 3

export function ThoughtGraph({
  data,
  layout,
  anchors,
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
  const anchorsRef = useRef(anchors)
  anchorsRef.current = anchors
  const lastResetKeyRef = useRef(resetKey)
  const needsFitRef = useRef(true)
  const ticksRef = useRef(0)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<Hover | null>(null)
  const palette = CANVAS[theme]
  const hoveredId = hover?.node.id ?? null

  // Crossfade between the previous and current highlight instead of snapping.
  const fadeRef = useRef<{ from: Set<string> | null; start: number }>({ from: null, start: 0 })
  const prevHighlightRef = useRef(highlight)
  const fadeProgressRef = useRef(1)
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (prevHighlightRef.current === highlight) return
    fadeRef.current = { from: prevHighlightRef.current, start: performance.now() }
    prevHighlightRef.current = highlight
    setFading(true)
    const timer = window.setTimeout(() => setFading(false), FADE_MS + 60)
    return () => window.clearTimeout(timer)
  }, [highlight])

  const graphData = useMemo(() => {
    if (lastResetKeyRef.current !== resetKey) {
      posRef.current.clear()
      lastResetKeyRef.current = resetKey
      needsFitRef.current = true
      ticksRef.current = 0
    }
    const known = posRef.current
    const neighbor = new Map<string, string>()
    for (const link of data.links) {
      const s = linkEnd(link.source)
      const t = linkEnd(link.target)
      if (known.has(t) && !known.has(s)) neighbor.set(s, t)
      if (known.has(s) && !known.has(t)) neighbor.set(t, s)
    }

    // New nodes start beside a placed neighbour, else inside their region.
    const spread = Math.sqrt(data.nodes.length) * 14
    const nodes = data.nodes.map((n) => {
      const pos = known.get(n.id) ?? known.get(neighbor.get(n.id) ?? '')
      const anchor =
        layout === 'chains' && n.kind === 'thought' ? anchorsRef.current.get(n.chainKey) : undefined
      const jitter = (r: number) => (Math.random() - 0.5) * r
      const radius = anchor?.radius ?? spread
      const start = pos
        ? { x: pos.x + jitter(16), y: pos.y + jitter(16), z: (pos.z ?? 0) + jitter(16) }
        : { x: (anchor?.x ?? 0) + jitter(radius), y: (anchor?.y ?? 0) + jitter(radius), z: jitter(radius) }
      return { ...n, ...(known.get(n.id) ?? start) } as SimNode
    })
    nodesRef.current = nodes
    return { nodes, links: data.links.map((l) => ({ ...l })) }
  }, [data, resetKey, layout])

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
      const anchorOf = (n: SimNode) =>
        layout === 'chains' && n.kind === 'thought' ? anchorsRef.current.get(n.chainKey) : undefined
      const pull = layout === 'chains' ? ANCHOR_PULL : CENTER_PULL
      fg.d3Force('x', forceX<NodeObject>((n) => anchorOf(n as SimNode)?.x ?? 0).strength(pull))
      fg.d3Force('y', forceY<NodeObject>((n) => anchorOf(n as SimNode)?.y ?? 0).strength(pull))
      if (mode === '3d') fg.d3Force('z', forceZ<NodeObject>(0).strength(pull))
      fg.d3Force('center', null)
      const physics = PHYSICS[layout]
      const charge = fg.d3Force('charge') as unknown as TunableForce | undefined
      // Short-range repulsion: long-range pushes flatten everything into an even disk.
      charge?.strength?.((n: SimNode) =>
        n.kind === 'topic' ? physics.charge.topic : physics.charge.thought,
      )
      charge?.distanceMax?.(physics.charge.range)
      const link = fg.d3Force('link') as unknown as TunableForce | undefined
      link?.distance?.((l: GraphLink) => physics.links[l.category].distance)
      link?.strength?.((l: GraphLink) => physics.links[l.category].strength)
      fg.d3Force(
        'collide',
        forceCollide<NodeObject>((node) => {
          const n = node as SimNode
          return n.size + (n.kind === 'topic' ? 16 : 5)
        }).iterations(2),
      )
      fg.d3ReheatSimulation()
    }

    attach()
    return () => {
      cancelled = true
    }
    // Forces persist across data updates (the library reheats gently on its
    // own), so they are only rebuilt when the layout itself changes.
  }, [mode, layout, resetKey])

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
      fg?.zoom(Math.max(fg.zoom(), LABEL_ZOOM.thought), 950)
      return
    }
    const fg = fg3dRef.current
    if (!fg) return
    const z = pos.z ?? 0
    const ratio = 1 + 160 / Math.max(Math.hypot(pos.x, pos.y, z), 1)
    fg.cameraPosition({ x: pos.x * ratio, y: pos.y * ratio, z: z * ratio }, { x: pos.x, y: pos.y, z }, 900)
  }, [focus, mode])

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

  /** 0 = fully lit, 1 = fully dimmed, eased across the crossfade. */
  const dimLevel = useCallback(
    (id: string) => {
      const target = highlight && !highlight.has(id) ? 1 : 0
      const p = fadeProgressRef.current
      if (p >= 1) return target
      const from = fadeRef.current.from && !fadeRef.current.from.has(id) ? 1 : 0
      return from + (target - from) * p
    },
    [highlight],
  )

  const markFrame = useCallback(() => {
    const elapsed = performance.now() - fadeRef.current.start
    fadeProgressRef.current = easeOut(Math.min(1, elapsed / FADE_MS))
  }, [])

  const drawLabel = useCallback(
    (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, weight: number, px: number) => {
      ctx.font = `${weight} ${px / scale}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3 / scale
      ctx.strokeStyle = palette.labelHalo
      ctx.strokeText(text, x, y)
      ctx.fillStyle = palette.label
      ctx.fillText(text, x, y)
    },
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
      const dim = dimLevel(n.id)
      const dimmed = dim > 0.5
      const fadeTo = (alpha: number) => alpha + (palette.dimAlpha - alpha) * dim

      if (n.kind === 'topic') {
        const alpha = fadeTo(1)
        ctx.beginPath()
        ctx.arc(x, y, n.size, 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(n.color, 0.07 * alpha)
        ctx.fill()
        ctx.lineWidth = (selected || hovered ? 2 : 1.2) / scale
        ctx.strokeStyle = withAlpha(n.color, alpha * (selected || hovered ? 0.9 : 0.45))
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(n.color, alpha * 0.9)
        ctx.fill()
        if (!dimmed && (scale >= LABEL_ZOOM.topic || selected)) {
          drawLabel(ctx, n.title, x, y + n.size + 3 / scale, scale, 600, n.count > 40 ? 13 : 11.5)
        }
        return
      }

      const retired = n.status === 'retired'
      const r = n.size * (selected ? 1.25 : hovered ? 1.12 : 1)
      const alpha = fadeTo(retired ? 0.55 : 1)

      if (n.versions.length > 0 && !retired) {
        // Stacked rings behind the node: earlier versions folded into it.
        const layers = Math.min(2, n.versions.length)
        for (let i = layers; i >= 1; i--) {
          ctx.beginPath()
          ctx.arc(x + i * r * 0.32, y - i * r * 0.32, r, 0, 2 * Math.PI)
          ctx.lineWidth = Math.max(0.5, r * 0.14)
          ctx.strokeStyle = withAlpha(n.color, alpha * (0.5 - i * 0.14))
          ctx.stroke()
        }
      }

      if (!retired && dim < 1 && (r > 6 || selected || hovered)) {
        ctx.beginPath()
        ctx.arc(x, y, r * (selected ? 2.4 : 1.9), 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(n.color, (selected ? 0.18 : 0.07) * (1 - dim))
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      if (retired) {
        ctx.setLineDash([1.6, 1.4])
        ctx.lineWidth = Math.max(0.8, r * 0.28)
        ctx.strokeStyle = withAlpha(n.color, alpha)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = withAlpha(n.color, alpha)
        ctx.fill()
      }

      if (n.status === 'contested' && !dimmed) {
        ctx.beginPath()
        ctx.arc(x, y, r + 1.6, 0, 2 * Math.PI)
        ctx.lineWidth = 0.9
        ctx.strokeStyle = withAlpha(CONTESTED_RING, 0.85)
        ctx.stroke()
      }

      if (selected || hovered) {
        ctx.beginPath()
        ctx.arc(x, y, r + 2.2 / scale + 1, 0, 2 * Math.PI)
        ctx.lineWidth = 1.6 / scale
        ctx.strokeStyle = withAlpha(palette.ring, selected ? 0.95 : 0.6)
        ctx.stroke()
      }

      const inFocus = Boolean(selectedId) && Boolean(highlight?.has(n.id))
      const showLabel =
        selected ||
        (!dimmed && (scale >= LABEL_ZOOM.thought || (inFocus && scale >= LABEL_ZOOM.focus)))
      if (!showLabel) return
      const text = n.title.length > 44 ? `${n.title.slice(0, 42)}…` : n.title
      drawLabel(ctx, text, x, y + r + 3 / scale, scale, selected ? 600 : 500, 11)
    },
    [selectedId, hoveredId, dimLevel, palette, highlight, drawLabel],
  )

  const paintChainLabels = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      if (layout !== 'chains' || scale > CHAIN_LABEL_MAX_ZOOM) return
      const bounds = new Map<string, { sx: number; n: number; top: number }>()
      for (const node of nodesRef.current) {
        if (node.kind !== 'thought') continue
        const pos = posRef.current.get(node.id)
        if (!pos) continue
        const b = bounds.get(node.chainKey) ?? { sx: 0, n: 0, top: Infinity }
        b.sx += pos.x
        b.n += 1
        b.top = Math.min(b.top, pos.y - node.size)
        bounds.set(node.chainKey, b)
      }
      ctx.font = `600 ${12 / scale}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = palette.chainLabel
      for (const [chain, b] of bounds) {
        if (b.n < MIN_LABELLED_CHAIN) continue
        ctx.fillText(chain.toUpperCase(), b.sx / b.n, b.top - 10 / scale)
      }
    },
    [palette, layout],
  )


  const touchesSelected = useCallback(
    (link: GraphLink) =>
      Boolean(selectedId) &&
      (linkEnd(link.source) === selectedId || linkEnd(link.target) === selectedId),
    [selectedId],
  )

  const resolveLinkColor = useCallback(
    (link: object) => {
      const l = link as GraphLink
      if (touchesSelected(l)) return withAlpha(l.color, 0.9)
      const dim = Math.max(dimLevel(linkEnd(l.source)), dimLevel(linkEnd(l.target)))
      const base = Math.min(0.9, palette.linkAlpha[l.category] * (LINK_EMPHASIS[layout][l.category] ?? 1))
      return withAlpha(l.color, base + (0.03 - base) * dim)
    },
    [dimLevel, touchesSelected, palette, layout],
  )

  const resolveLinkWidth = useCallback(
    (link: object) => {
      const l = link as GraphLink
      return linkWidth(l) * (touchesSelected(l) ? 2.2 : 1)
    },
    [touchesSelected],
  )

  const fitView = useCallback(
    (ms: number) => {
      if (mode === '2d') fgRef.current?.zoomToFit(ms, 60)
      else fg3dRef.current?.zoomToFit(ms, 60)
    },
    [mode],
  )

  const handleEngineTick = useCallback(() => {
    if (needsFitRef.current && ++ticksRef.current === EARLY_FIT_TICK) fitView(1600)
  }, [fitView])

  const handleEngineStop = useCallback(() => {
    if (!needsFitRef.current) return
    needsFitRef.current = false
    ticksRef.current = 0
    fitView(1400)
  }, [fitView])

  const zoomBy = (factor: number) => {
    const fg = fgRef.current
    if (mode === '2d' && fg) fg.zoom(fg.zoom() * factor, 450)
  }

  const fit = () => {
    if (mode === '2d') fgRef.current?.zoomToFit(900, 60)
    else fg3dRef.current?.zoomToFit(900, 60)
  }

  return (
    <div className={`graph-canvas${hover ? ' is-hovering-node' : ''}`} ref={containerRef}>
      {size.width > 0 &&
        (mode === '3d' ? (
          <Suspense fallback={<div className="graph-loading">Loading 3D view…</div>}>
            <ForceGraph3D
              ref={fg3dRef}
              width={size.width}
              height={size.height}
              graphData={graphData}
              nodeId="id"
              backgroundColor={palette.background}
              showNavInfo={false}
              nodeRelSize={1.6}
              nodeResolution={10}
              nodeVal={(node) => {
                const n = node as SimNode
                return (n.size * (n.id === selectedId ? 1.6 : 1)) ** 2 / 4
              }}
              nodeColor={(node) => {
                const n = node as SimNode
                if (isDimmed(n.id)) return withAlpha(n.color, palette.dimAlpha)
                if (n.kind === 'topic') return withAlpha(n.color, 0.35)
                return n.status === 'retired' ? withAlpha(n.color, 0.35) : n.color
              }}
              nodeOpacity={0.92}
              nodeLabel={(node) => tooltipHtml(node as SimNode)}
              linkColor={resolveLinkColor}
              linkWidth={(link) => (touchesSelected(link as GraphLink) ? 1.2 : 0)}
              linkDirectionalParticles={(link) => (touchesSelected(link as GraphLink) ? 3 : 0)}
              linkDirectionalParticleWidth={1.6}
              linkDirectionalParticleSpeed={0.006}
              enableNodeDrag={false}
              onNodeClick={(node) => onSelect(node as SimNode)}
              onBackgroundClick={() => onSelect(null)}
              onEngineTick={() => {
                handleEngineTick()
                for (const n of graphData.nodes) {
                  if (n.x != null && n.y != null) {
                    posRef.current.set(n.id, { x: n.x, y: n.y, z: n.z ?? 0 })
                  }
                }
              }}
              onEngineStop={handleEngineStop}
              cooldownTicks={COOLDOWN_TICKS}
              cooldownTime={COOLDOWN_MS}
              d3VelocityDecay={VELOCITY_DECAY}
              d3AlphaDecay={ALPHA_DECAY}
            />
          </Suspense>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData as FGData}
            nodeId="id"
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            onRenderFramePre={markFrame}
            onRenderFramePost={paintChainLabels}
            autoPauseRedraw={!fading}
            linkColor={resolveLinkColor}
            linkWidth={resolveLinkWidth}
            linkCurvature={(link) => ((link as GraphLink).category === 'lineage' ? 0.18 : 0)}
            linkDirectionalArrowLength={(link) => (touchesSelected(link as GraphLink) ? 3.4 : 0)}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(link) => (touchesSelected(link as GraphLink) ? 2 : 0)}
            linkDirectionalParticleWidth={2.2}
            linkDirectionalParticleSpeed={0.008}
            linkDirectionalParticleColor={(link) => (link as GraphLink).color}
            enableNodeDrag={false}
            enablePointerInteraction={false}
            enablePanInteraction={allowPan}
            onEngineTick={handleEngineTick}
            onEngineStop={handleEngineStop}
            cooldownTicks={COOLDOWN_TICKS}
            cooldownTime={COOLDOWN_MS}
            d3VelocityDecay={VELOCITY_DECAY}
            d3AlphaDecay={ALPHA_DECAY}
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
        <button type="button" onClick={fit} aria-label="Fit to screen" title="Fit to screen">
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

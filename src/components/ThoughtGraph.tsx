import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d'
import type { Theme } from '../hooks/useTheme'
import type { GraphData, GraphLink, GraphNode } from '../types'

interface ThoughtGraphProps {
  data: GraphData
  selectedId: string | null
  theme: Theme
  onSelect: (node: GraphNode | null) => void
}

type FGNode = NodeObject<GraphNode>
type FGLink = LinkObject<GraphNode, GraphLink>

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

export function ThoughtGraph({
  data,
  selectedId,
  theme,
  onSelect,
}: ThoughtGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(
    undefined,
  )
  const prevNodesRef = useRef<Map<string, FGNode>>(new Map())
  const [size, setSize] = useState({ width: 0, height: 0 })
  const palette = THEME_CANVAS[theme]
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Preserve simulation positions across data refreshes so hit-testing stays aligned.
  const graphData = useMemo(() => {
    const prev = prevNodesRef.current
    const nodes = data.nodes.map((n) => {
      const old = prev.get(n.id)
      return old
        ? {
            ...n,
            x: old.x,
            y: old.y,
            vx: old.vx,
            vy: old.vy,
            fx: old.fx,
            fy: old.fy,
          }
        : { ...n }
    })
    const nextPrev = new Map<string, FGNode>()
    for (const node of nodes) {
      nextPrev.set(node.id, node as FGNode)
    }
    prevNodesRef.current = nextPrev
    return {
      nodes,
      links: data.links.map((l) => ({ ...l })),
    }
  }, [data])

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
    if (!selectedId || !fgRef.current) return
    const node = graphData.nodes.find((n) => n.id === selectedId) as
      | (GraphNode & { x?: number; y?: number })
      | undefined
    if (!node || node.x == null || node.y == null) return
    // Gentle re-center only — hard zoom made dense clusters hard to click next.
    fgRef.current.centerAt(node.x, node.y, 400)
  }, [selectedId, graphData.nodes])

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & FGNode
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

  const paintPointerArea = useCallback(
    (
      node: FGNode,
      color: string,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const n = node as GraphNode & FGNode
      // ~14px minimum screen-space target so small / zoomed-out nodes stay clickable.
      const r = Math.max((n.size ?? 4.5) + 3, 14 / Math.max(globalScale, 0.35))
      ctx.beginPath()
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [],
  )

  return (
    <div className="graph-canvas" ref={containerRef}>
      {size.width > 0 && (
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
          nodePointerAreaPaint={paintPointerArea}
          // Do not register link hit targets — dense edges were stealing node clicks.
          linkPointerAreaPaint={() => undefined}
          linkHoverPrecision={0}
          linkColor={(link) =>
            (link as GraphLink).color || palette.linkFallback
          }
          linkWidth={(link) =>
            (link as GraphLink).kind === 'spine' ? 0.45 : 0.85
          }
          linkDirectionalArrowLength={2.8}
          linkDirectionalArrowRelPos={1}
          enableNodeDrag
          enablePointerInteraction
          onNodeClick={(node, event) => {
            event.stopPropagation()
            onSelectRef.current(node as GraphNode)
          }}
          onBackgroundClick={() => onSelectRef.current(null)}
          cooldownTicks={140}
          d3VelocityDecay={0.28}
        />
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

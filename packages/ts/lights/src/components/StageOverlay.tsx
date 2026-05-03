import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useProject } from '../model/ProjectContext'
import type { Surface, Point } from '../model/types'
import PaverStageHandles from './PaverStageHandles'

// Session-only surface clipboard — not persisted in project state.
let surfaceClipboard: Surface | null = null

// ── Constants ─────────────────────────────────────────────────────────────────

const DRAG_THRESHOLD = 0.006   // normalised stage coords (~5 px on 800 px canvas)
const STEP_FINE      = 0.001   // plain arrow key
const STEP_COARSE    = 0.01    // shift + arrow key

// Edge i connects corner[i] → corner[(i+1)%4]
const EDGE_CORNERS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]

// ── Focus model ───────────────────────────────────────────────────────────────

/**
 * Which part of the active surface is focused for keyboard nudging.
 * null  = whole surface (all corners move together)
 * corner = one corner
 * edge   = two adjacent corners
 */
type FocusedElement =
  | null
  | { kind: 'corner'; idx: number }
  | { kind: 'edge';   idx: number }

/** Return which corner indices should move for the given focus element. */
function focusedIndices(focus: FocusedElement): Set<number> | null {
  if (focus === null) return null                                     // null = all
  if (focus.kind === 'corner') return new Set([focus.idx])
  return new Set(EDGE_CORNERS[focus.idx])
}

/** Apply (dx, dy) to the corners selected by focus; clamp to [0,1]. */
function applyDelta(
  polygon: [Point, Point, Point, Point],
  focus: FocusedElement,
  dx: number,
  dy: number,
): [Point, Point, Point, Point] {
  const indices = focusedIndices(focus)
  return polygon.map((p, i) => {
    if (indices !== null && !indices.has(i)) return p
    return {
      x: Math.max(0, Math.min(1, p.x + dx)),
      y: Math.max(0, Math.min(1, p.y + dy)),
    }
  }) as [Point, Point, Point, Point]
}

// ── Drag state ────────────────────────────────────────────────────────────────

type DragState = {
  surfaceId: string
  slideId: string
  startPt: Point
  startPolygon: [Point, Point, Point, Point]
  livePolygon: [Point, Point, Point, Point]
  focus: FocusedElement   // what's being dragged
  hasMoved: boolean
} | null

/** Per-surface timestamp for manual double-click detection. */
type LastClick = { surfaceId: string; time: number }

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SVG overlay that renders surface polygons on the stage.
 *
 * Interactions:
 * - Body click        → select surface (double-click enters editor)
 * - Corner click/drag → focus + move one corner (Shift: H/V axis lock)
 * - Edge click/drag   → focus + move two adjacent corners (Shift: H/V axis lock)
 * - Arrow keys        → nudge focused element (Shift: coarse step)
 *
 * Focused element is highlighted and determines what arrow keys control.
 * Clicking the body clears the focus so all corners move together.
 */
export default function StageOverlay() {
  const { state, dispatch } = useProject()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragState>(null)
  const [focusedElement, setFocusedElement] = useState<FocusedElement>(null)
  const lastClickRef = useRef<LastClick | null>(null)

  // Track SVG size
  useEffect(() => {
    const obs = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    )
    obs.observe(svgRef.current!)
    return () => obs.disconnect()
  }, [])

  const { project, selectedSlideId, selectedSurfaceId } = state
  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []
  const volumes = slide?.volumes ?? []

  // ── Arrow key nudge ────────────────────────────────────────────────────────
  useEffect(() => {
    const DIRS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1],   ArrowDown:  [0, 1],
    }
    function onKey(e: KeyboardEvent) {
      const dir = DIRS[e.key]
      if (!dir || !selectedSurfaceId || !selectedSlideId) return
      e.preventDefault()
      const surface = surfaces.find(s => s.id === selectedSurfaceId)
      if (!surface) return
      const step = e.shiftKey ? STEP_COARSE : STEP_FINE
      dispatch({
        type: 'surface:update',
        slideId: selectedSlideId,
        surface: {
          ...surface,
          outputPolygon: applyDelta(surface.outputPolygon, focusedElement, dir[0] * step, dir[1] * step),
        },
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSurfaceId, selectedSlideId, focusedElement, surfaces, dispatch])

  // ── Copy / paste ───────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'c') {
        const surface = surfaces.find(s => s.id === selectedSurfaceId)
        if (surface) { e.preventDefault(); surfaceClipboard = surface }
      } else if (e.key === 'v') {
        if (!surfaceClipboard || !selectedSlideId) return
        e.preventDefault()
        const src = surfaceClipboard
        const copy: Surface = {
          ...src,
          id: crypto.randomUUID(),
          name: `${src.name} copy`,
          outputPolygon: src.outputPolygon.map(p => ({
            x: Math.min(1, p.x + 0.02),
            y: Math.min(1, p.y + 0.02),
          })) as [Point, Point, Point, Point],
          layers: src.layers.map(l => ({ ...l, id: crypto.randomUUID() })),
        }
        dispatch({ type: 'surface:paste', slideId: selectedSlideId, surface: copy })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedSurfaceId, selectedSlideId, surfaces, dispatch])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function toNorm(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    }
  }

  function toPx(p: Point) {
    return { x: p.x * size.w, y: p.y * size.h }
  }

  function centroid(polygon: [Point, Point, Point, Point]): Point {
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / 4,
      y: polygon.reduce((s, p) => s + p.y, 0) / 4,
    }
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function startDrag(e: ReactPointerEvent, surface: Surface, slideId: string, focus: FocusedElement) {
    svgRef.current!.setPointerCapture(e.pointerId)
    setFocusedElement(focus)
    const startPt = toNorm(e.clientX, e.clientY)
    const startPolygon = [...surface.outputPolygon] as [Point, Point, Point, Point]
    setDrag({ surfaceId: surface.id, slideId, startPt, startPolygon, livePolygon: startPolygon, focus, hasMoved: false })
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return
    const pt = toNorm(e.clientX, e.clientY)
    let dx = pt.x - drag.startPt.x
    let dy = pt.y - drag.startPt.y
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) > DRAG_THRESHOLD

    // Shift: lock to dominant axis
    if (e.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0
      else dx = 0
    }

    setDrag({ ...drag, livePolygon: applyDelta(drag.startPolygon, drag.focus, dx, dy), hasMoved })
  }

  function onPointerUp() {
    if (!drag) return
    const surface = surfaces.find(s => s.id === drag.surfaceId)

    if (drag.hasMoved) {
      if (surface) {
        dispatch({ type: 'surface:update', slideId: drag.slideId, surface: { ...surface, outputPolygon: drag.livePolygon } })
      }
    } else if (drag.focus === null) {
      // Body click: select + double-click detection for enter
      const now = Date.now()
      const last = lastClickRef.current
      if (last?.surfaceId === drag.surfaceId && now - last.time < 300) {
        lastClickRef.current = null
        dispatch({ type: 'surface:select', surfaceId: drag.surfaceId })
        dispatch({ type: 'surface:enter' })
      } else {
        lastClickRef.current = { surfaceId: drag.surfaceId, time: now }
        dispatch({ type: 'surface:select', surfaceId: drag.surfaceId })
      }
    } else {
      // Corner / edge click: select (focus already set in startDrag)
      dispatch({ type: 'surface:select', surfaceId: drag.surfaceId })
    }

    setDrag(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (size.w === 0) return (
    <svg ref={svgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  )

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: drag ? 'grabbing' : 'default', overflow: 'visible' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {volumes.map(volume => (
        <PaverStageHandles
          key={volume.id}
          paver={volume}
          slideId={selectedSlideId!}
          svgRef={svgRef}
        />
      ))}
      {surfaces.map(surface => {
        const polygon = drag?.surfaceId === surface.id ? drag.livePolygon : surface.outputPolygon
        const selected = surface.id === selectedSurfaceId
        const c = toPx(centroid(polygon))
        const pointsStr = polygon.map(p => { const q = toPx(p); return `${q.x},${q.y}` }).join(' ')

        return (
          <g key={surface.id}>
            {/* ── Fill (body drag target) ── */}
            <polygon
              points={pointsStr}
              fill={selected ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.04)'}
              stroke="none"
              style={{ cursor: drag ? 'grabbing' : 'move' }}
              onPointerDown={e => startDrag(e, surface, selectedSlideId!, null)}
            />

            {/* ── Edges ── */}
            {polygon.map((p, idx) => {
              const next = polygon[(idx + 1) % 4]
              const a = toPx(p), b = toPx(next)
              const isFocused = selected && focusedElement?.kind === 'edge' && focusedElement.idx === idx
              return (
                <g key={idx}>
                  {/* Visual stroke */}
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isFocused ? '#93c5fd' : selected ? '#60a5fa' : '#555'}
                    strokeWidth={isFocused ? 2.5 : selected ? 1.5 : 1}
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Wide invisible hit area */}
                  <line
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="rgba(255,255,255,0.001)"
                    strokeWidth={12}
                    style={{ cursor: drag ? 'grabbing' : 'grab' }}
                    onPointerDown={e => { e.stopPropagation(); startDrag(e, surface, selectedSlideId!, { kind: 'edge', idx }) }}
                  />
                </g>
              )
            })}

            {/* ── Label ── */}
            <text
              x={c.x} y={c.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill={selected ? '#60a5fa' : '#555'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {surface.name}
            </text>

            {/* ── Corner handles ── */}
            {polygon.map((p, idx) => {
              const { x, y } = toPx(p)
              const isFocused = selected && focusedElement?.kind === 'corner' && focusedElement.idx === idx
              return (
                <circle
                  key={idx}
                  cx={x} cy={y}
                  r={isFocused ? 7 : 6}
                  fill={isFocused ? '#60a5fa' : selected ? '#1e40af' : '#2a2a2a'}
                  stroke={isFocused ? '#fff' : selected ? '#60a5fa' : '#555'}
                  strokeWidth={1.5}
                  style={{ cursor: drag ? 'grabbing' : 'grab' }}
                  onPointerDown={e => { e.stopPropagation(); startDrag(e, surface, selectedSlideId!, { kind: 'corner', idx }) }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

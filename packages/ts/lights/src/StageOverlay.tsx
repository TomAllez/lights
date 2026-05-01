import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useProject } from './model/ProjectContext'
import type { Surface } from './model/types'
import type { Point } from './model/types'

// Drag threshold in normalised stage coords (~5 px on an 800 px canvas).
const DRAG_THRESHOLD = 0.006

type DragState = {
  surfaceId: string
  slideId: string
  startPt: Point
  startPolygon: [Point, Point, Point, Point]
  livePolygon: [Point, Point, Point, Point]
  cornerIdx: number | null   // null = body drag (translate all corners)
  hasMoved: boolean
} | null

export default function StageOverlay() {
  const { state, dispatch } = useProject()
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragState>(null)

  useEffect(() => {
    const el = svgRef.current!
    const obs = new ResizeObserver(([e]) => {
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const { project, selectedSlideId, selectedSurfaceId } = state
  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []

  function toNorm(clientX: number, clientY: number): Point {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    }
  }

  function px(p: Point) {
    return { x: p.x * size.w, y: p.y * size.h }
  }

  function centroid(polygon: [Point, Point, Point, Point]): Point {
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / 4,
      y: polygon.reduce((s, p) => s + p.y, 0) / 4,
    }
  }

  function startDrag(
    e: ReactPointerEvent,
    surface: Surface,
    slideId: string,
    cornerIdx: number | null
  ) {
    svgRef.current!.setPointerCapture(e.pointerId)
    const startPt = toNorm(e.clientX, e.clientY)
    const startPolygon = [...surface.outputPolygon] as [Point, Point, Point, Point]
    setDrag({ surfaceId: surface.id, slideId, startPt, startPolygon, livePolygon: startPolygon, cornerIdx, hasMoved: false })
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return
    const pt = toNorm(e.clientX, e.clientY)
    const dx = pt.x - drag.startPt.x
    const dy = pt.y - drag.startPt.y
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) > DRAG_THRESHOLD

    let livePolygon: [Point, Point, Point, Point]
    if (drag.cornerIdx !== null) {
      livePolygon = drag.startPolygon.map((p, i) => i === drag.cornerIdx ? pt : p) as [Point, Point, Point, Point]
    } else {
      livePolygon = drag.startPolygon.map(p => ({
        x: Math.max(0, Math.min(1, p.x + dx)),
        y: Math.max(0, Math.min(1, p.y + dy)),
      })) as [Point, Point, Point, Point]
    }

    setDrag({ ...drag, livePolygon, hasMoved })
  }

  function onPointerUp() {
    if (!drag) return
    const surface = surfaces.find(s => s.id === drag.surfaceId)

    if (drag.cornerIdx !== null || drag.hasMoved) {
      if (surface) {
        dispatch({
          type: 'surface:update',
          slideId: drag.slideId,
          surface: { ...surface, outputPolygon: drag.livePolygon },
        })
      }
    } else {
      // No movement on body pointerdown = select
      dispatch({ type: 'surface:select', surfaceId: drag.surfaceId })
    }

    setDrag(null)
  }

  if (size.w === 0) return <svg ref={svgRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: drag ? 'grabbing' : 'default',
        overflow: 'visible',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {surfaces.map(surface => {
        const polygon = drag?.surfaceId === surface.id ? drag.livePolygon : surface.outputPolygon
        const selected = surface.id === selectedSurfaceId
        const c = px(centroid(polygon))
        const pointsStr = polygon.map(p => { const q = px(p); return `${q.x},${q.y}` }).join(' ')

        return (
          <g key={surface.id}>
            <polygon
              points={pointsStr}
              fill={selected ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.04)'}
              stroke={selected ? '#60a5fa' : '#555'}
              strokeWidth={selected ? 1.5 : 1}
              style={{ cursor: drag ? 'grabbing' : 'move' }}
              onPointerDown={e => startDrag(e, surface, selectedSlideId!, null)}
              onDoubleClick={() => dispatch({ type: 'surface:enter' })}
            />
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill={selected ? '#60a5fa' : '#555'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {surface.name}
            </text>
            {polygon.map((p, idx) => {
              const { x, y } = px(p)
              return (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r={6}
                  fill={selected ? '#1e40af' : '#2a2a2a'}
                  stroke={selected ? '#60a5fa' : '#555'}
                  strokeWidth={1.5}
                  style={{ cursor: drag ? 'grabbing' : 'grab' }}
                  onPointerDown={e => { e.stopPropagation(); startDrag(e, surface, selectedSlideId!, idx) }}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

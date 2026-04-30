import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useProject } from './model/ProjectContext'
import type { Surface } from './model/types'
import type { Point } from './model/types'

type DragState = {
  surfaceId: string
  slideId: string
  cornerIdx: number
  polygon: [Point, Point, Point, Point]
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

  function onCornerDown(
    e: ReactPointerEvent<SVGCircleElement>,
    surface: Surface,
    slideId: string,
    idx: number
  ) {
    e.stopPropagation()
    svgRef.current!.setPointerCapture(e.pointerId)
    setDrag({
      surfaceId: surface.id,
      slideId,
      cornerIdx: idx,
      polygon: [...surface.outputPolygon] as [Point, Point, Point, Point],
    })
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return
    const pt = toNorm(e.clientX, e.clientY)
    const polygon = drag.polygon.map((p, i) => (i === drag.cornerIdx ? pt : p)) as [Point, Point, Point, Point]
    setDrag({ ...drag, polygon })
  }

  function onPointerUp() {
    if (!drag) return
    const surface = surfaces.find(s => s.id === drag.surfaceId)
    if (surface) {
      dispatch({
        type: 'surface:update',
        slideId: drag.slideId,
        surface: { ...surface, outputPolygon: drag.polygon },
      })
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
        const polygon = drag?.surfaceId === surface.id ? drag.polygon : surface.outputPolygon
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
              style={{ cursor: 'pointer' }}
              onClick={() => dispatch({ type: 'surface:select', surfaceId: surface.id })}
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
                  onPointerDown={e => onCornerDown(e, surface, selectedSlideId!, idx)}
                />
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

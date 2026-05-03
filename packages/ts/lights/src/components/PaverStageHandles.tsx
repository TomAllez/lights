import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useProject } from '../model/ProjectContext'
import type { Paver, Point } from '../model/types'

interface Props {
  paver: Paver
  slideId: string
  svgRef: React.RefObject<SVGSVGElement | null>
}

type DragState = {
  cornerIdx: number
  startPt: Point
  startCorner: Point
  livePt: Point
} | null

const FRONT_EDGES: [number, number][] = [[0,1],[1,2],[2,3],[3,0]]
const BACK_EDGES:  [number, number][] = [[4,5],[5,6],[6,7],[7,4]]
const SIDE_EDGES:  [number, number][] = [[0,4],[1,5],[2,6],[3,7]]

export default function PaverStageHandles({ paver, slideId, svgRef }: Props) {
  const { state, dispatch } = useProject()
  const { selectedVolumeId } = state
  const selected = paver.id === selectedVolumeId

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragState>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const obs = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    )
    obs.observe(svg)
    return () => obs.disconnect()
  }, [svgRef])

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

  function onCornerDown(e: ReactPointerEvent, idx: number) {
    e.stopPropagation()
    svgRef.current!.setPointerCapture(e.pointerId)
    if (!selected) dispatch({ type: 'volume:select', volumeId: paver.id })
    const startPt = toNorm(e.clientX, e.clientY)
    setDrag({ cornerIdx: idx, startPt, startCorner: paver.stageCorners[idx], livePt: paver.stageCorners[idx] })
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return
    const pt = toNorm(e.clientX, e.clientY)
    const dx = pt.x - drag.startPt.x
    const dy = pt.y - drag.startPt.y
    const livePt: Point = {
      x: Math.max(0, Math.min(1, drag.startCorner.x + dx)),
      y: Math.max(0, Math.min(1, drag.startCorner.y + dy)),
    }
    setDrag({ ...drag, livePt })
  }

  function onPointerUp() {
    if (!drag) return
    dispatch({
      type: 'volume:updateCorner',
      slideId,
      volumeId: paver.id,
      cornerIdx: drag.cornerIdx,
      point: drag.livePt,
    })
    setDrag(null)
  }

  function onBodyDown(e: ReactPointerEvent) {
    e.stopPropagation()
    dispatch({ type: 'volume:select', volumeId: paver.id })
  }

  if (size.w === 0) return null

  const corners = paver.stageCorners.map((p, i) =>
    drag?.cornerIdx === i ? drag.livePt : p
  )

  const allEdges = [...FRONT_EDGES, ...BACK_EDGES, ...SIDE_EDGES]
  const frontPts = corners.slice(0, 4).map(p => { const q = toPx(p); return `${q.x},${q.y}` }).join(' ')

  return (
    <g
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Body hit target (front face polygon) */}
      <polygon
        points={frontPts}
        fill={selected ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.04)'}
        stroke="none"
        style={{ cursor: 'move' }}
        onPointerDown={onBodyDown}
      />

      {/* Edges */}
      {allEdges.map(([a, b], i) => {
        const pa = toPx(corners[a]), pb = toPx(corners[b])
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={selected ? '#fbbf24' : '#666'}
            strokeWidth={selected ? 1.5 : 1}
            strokeDasharray={i >= 8 ? '4 3' : undefined}
            style={{ pointerEvents: 'none' }}
          />
        )
      })}

      {/* Corner handles */}
      {corners.map((p, idx) => {
        const { x, y } = toPx(p)
        const isFront = idx < 4
        return (
          <circle
            key={idx}
            cx={x} cy={y}
            r={isFront ? 6 : 4}
            fill={selected ? (isFront ? '#fbbf24' : '#92400e') : '#3a3a3a'}
            stroke={selected ? '#fff' : '#666'}
            strokeWidth={1.5}
            style={{ cursor: 'grab' }}
            onPointerDown={e => onCornerDown(e, idx)}
          />
        )
      })}

      {/* Label */}
      {(() => {
        const c = corners.slice(0,4).reduce((acc, p) => ({ x: acc.x + p.x/4, y: acc.y + p.y/4 }), { x: 0, y: 0 })
        const cPx = toPx(c)
        return (
          <text
            x={cPx.x} y={cPx.y}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fill={selected ? '#fbbf24' : '#666'}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {paver.name}
          </text>
        )
      })()}
    </g>
  )
}

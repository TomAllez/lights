import { useEffect, useRef, useState } from 'react'
import { useProject } from '../model/ProjectContext'
import type { LayerTransform, Point } from '../model/types'
import LayerObject from './LayerObject'
import type { Corner } from './LayerObject'

// ── Drag state ────────────────────────────────────────────────────────────────

type DragKind =
  | { kind: 'move';   startPx: Point; startT: LayerTransform }
  | { kind: 'resize'; corner: Corner; startPx: Point; startT: LayerTransform }
  | { kind: 'rotate'; centerPx: Point; startAngle: number; startRotation: number }

interface ActiveDrag { layerId: string; drag: DragKind; canvasW: number; canvasH: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Estimate the aspect ratio of a surface's output polygon by averaging the
 * widths and heights of opposite edges in stage-normalized coordinates.
 * Stage aspect ratio (16:9) is applied to compensate for non-square stage pixels.
 */
function surfaceAspectRatio(polygon: [Point, Point, Point, Point]): number {
  const stageAr = 16 / 9
  function dist(a: Point, b: Point) {
    const dx = (a.x - b.x) * stageAr
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  }
  const w = (dist(polygon[0], polygon[1]) + dist(polygon[3], polygon[2])) / 2
  const h = (dist(polygon[0], polygon[3]) + dist(polygon[1], polygon[2])) / 2
  return h > 0 ? w / h : 16 / 9
}

/** Return the largest (w, h) that fits inside (aw, ah) at aspect ratio ar. */
function fitContain(aw: number, ah: number, ar: number) {
  return aw / ah > ar
    ? { w: ah * ar, h: ah }
    : { w: aw, h: aw / ar }
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Surface-mode editor: a flat 2D canvas scaled to match the surface's aspect
 * ratio. Each visible layer is rendered as an interactive div that can be:
 * - Dragged to move
 * - Corner-dragged to resize (Shift = aspect-lock)
 * - Rotation-handle-dragged to rotate
 *
 * Escape exits back to the stage view.
 */
export default function SurfaceCanvas() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surface = slide?.surfaces.find(s => s.id === selectedSurfaceId)

  const areaRef  = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef  = useRef<ActiveDrag | null>(null)
  const [availableSize, setAvailableSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'surface:exit' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setAvailableSize({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (!surface || !selectedSlideId) return null

  const ar = surfaceAspectRatio(surface.outputPolygon)
  const { w: aw, h: ah } = availableSize
  const { w: canvasW, h: canvasH } = aw > 0 && ah > 0 ? fitContain(aw, ah, ar) : { w: 0, h: 0 }

  function toPx(e: React.PointerEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDrag(e: React.PointerEvent, layerId: string, drag: DragKind) {
    e.stopPropagation()
    dragRef.current = { layerId, drag, canvasW, canvasH }
    canvasRef.current!.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const active = dragRef.current
    if (!active) return
    const layer = surface!.layers.find(l => l.id === active.layerId)
    if (!layer) return

    const px = toPx(e)
    const { drag, canvasW: cw, canvasH: ch } = active
    let newT: LayerTransform

    if (drag.kind === 'move') {
      newT = {
        ...drag.startT,
        x: drag.startT.x + (px.x - drag.startPx.x) / cw,
        y: drag.startT.y + (px.y - drag.startPx.y) / ch,
      }
    } else if (drag.kind === 'resize') {
      const { corner, startPx, startT } = drag
      const dxN = (px.x - startPx.x) / cw
      const dyN = (px.y - startPx.y) / ch
      const wSign = corner === 'tl' || corner === 'bl' ? -1 : 1
      const hSign = corner === 'tl' || corner === 'tr' ? -1 : 1
      let newW = Math.max(0.02, startT.w + wSign * dxN)
      let newH = Math.max(0.02, startT.h + hSign * dyN)
      if (e.shiftKey) {
        const ratio = startT.w / startT.h
        if (Math.abs(dxN) >= Math.abs(dyN)) newH = Math.max(0.02, newW / ratio)
        else newW = Math.max(0.02, newH * ratio)
      }
      newT = {
        ...startT,
        x: startT.x + (wSign * (newW - startT.w)) / 2,
        y: startT.y + (hSign * (newH - startT.h)) / 2,
        w: newW,
        h: newH,
      }
    } else {
      const { centerPx, startAngle, startRotation } = drag
      const angle = Math.atan2(px.y - centerPx.y, px.x - centerPx.x) * 180 / Math.PI
      newT = { ...layer.transform, rotation: startRotation + (angle - startAngle) }
    }

    dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...layer, transform: newT } })
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null
    canvasRef.current?.releasePointerCapture(e.pointerId)
  }

  return (
    <div className="surface-mode">
      <div className="surface-mode-header">
        <button className="back-btn" onClick={() => dispatch({ type: 'surface:exit' })}>← Stage</button>
        <span className="surface-mode-name">{surface.name}</span>
      </div>
      <div ref={areaRef} className="surface-mode-canvas-area">
        {canvasW > 0 && (
          <div
            ref={canvasRef}
            className="surface-mode-canvas"
            style={{ width: canvasW, height: canvasH }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerDown={e => { if (e.target === canvasRef.current) dispatch({ type: 'layer:select', layerId: null }) }}
          >
            {[...surface.layers].reverse().filter(l => l.visible).map(layer => (
              <LayerObject
                key={layer.id}
                layer={layer}
                canvasW={canvasW}
                canvasH={canvasH}
                isSelected={layer.id === selectedLayerId}
                onMoveStart={e => startDrag(e, layer.id, { kind: 'move', startPx: toPx(e), startT: { ...layer.transform } })}
                onResizeStart={(e, corner) => startDrag(e, layer.id, { kind: 'resize', corner, startPx: toPx(e), startT: { ...layer.transform } })}
                onRotateStart={e => {
                  const t = layer.transform
                  const centerPx = { x: t.x * canvasW, y: t.y * canvasH }
                  const px = toPx(e)
                  startDrag(e, layer.id, {
                    kind: 'rotate',
                    centerPx,
                    startAngle: Math.atan2(px.y - centerPx.y, px.x - centerPx.x) * 180 / Math.PI,
                    startRotation: t.rotation,
                  })
                }}
                onSelect={() => dispatch({ type: 'layer:select', layerId: layer.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

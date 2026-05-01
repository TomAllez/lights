import { useEffect } from 'react'
import { useProject } from './model/ProjectContext'
import type { Point } from './model/types'

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

export default function SurfaceCanvas() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surface = slide?.surfaces.find(s => s.id === selectedSurfaceId)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dispatch({ type: 'surface:exit' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  if (!surface || !selectedSlideId) return null

  const solidLayer = surface.layers.find(l => l.type === 'solid')
  const fillColor = solidLayer?.type === 'solid' ? solidLayer.color : '#111122'
  const ar = surfaceAspectRatio(surface.outputPolygon)

  return (
    <div className="surface-mode">
      <div className="surface-mode-header">
        <button
          className="back-btn"
          onClick={() => dispatch({ type: 'surface:exit' })}
        >
          ← Stage
        </button>
        <span className="surface-mode-name">{surface.name}</span>
      </div>
      <div className="surface-mode-canvas-area">
        <div className="surface-mode-canvas" style={{ aspectRatio: ar, background: fillColor }} />
      </div>
    </div>
  )
}

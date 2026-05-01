import { useProject } from './model/ProjectContext'
import type { SolidLayer } from './model/types'

export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []
  const surface = surfaces.find(s => s.id === selectedSurfaceId)

  // ── Surface mode: show editor for the selected surface ──────────────────────
  if (selectedSurfaceId && surface && selectedSlideId) {
    const solidLayer = surface.layers.find((l): l is SolidLayer => l.type === 'solid')

    function setColor(color: string) {
      const layers = solidLayer
        ? surface!.layers.map(l => l.id === solidLayer!.id ? { ...solidLayer!, color } : l)
        : [{ id: crypto.randomUUID(), type: 'solid' as const, color }, ...surface!.layers]
      dispatch({ type: 'surface:update', slideId: selectedSlideId!, surface: { ...surface!, layers } })
    }

    return (
      <aside className="surface-panel">
        <div className="surface-panel-header">
          <span>{surface.name}</span>
        </div>
        <div className="surface-editor">
          <label className="surface-editor-label">Fill</label>
          <input
            type="color"
            className="surface-editor-color"
            value={solidLayer?.color ?? '#111122'}
            onChange={e => setColor(e.target.value)}
          />
        </div>
      </aside>
    )
  }

  // ── Stage mode: show surface list ───────────────────────────────────────────
  return (
    <aside className="surface-panel">
      <div className="surface-panel-header">
        <span>Surfaces</span>
        {selectedSlideId && (
          <button
            className="icon-btn"
            title="Add surface"
            onClick={() => dispatch({ type: 'surface:add', slideId: selectedSlideId })}
          >
            +
          </button>
        )}
      </div>

      {!selectedSlideId ? (
        <p className="panel-empty">No slide selected</p>
      ) : surfaces.length === 0 ? (
        <p className="panel-empty">No surfaces</p>
      ) : (
        <div className="surface-list">
          {surfaces.map(s => (
            <div
              key={s.id}
              className={`surface-item${s.id === selectedSurfaceId ? ' selected' : ''}`}
              onClick={() => dispatch({ type: 'surface:select', surfaceId: s.id })}
            >
              <span className="surface-name">{s.name}</span>
              <button
                className="icon-btn surface-remove"
                title="Remove surface"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'surface:remove', slideId: selectedSlideId, surfaceId: s.id })
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

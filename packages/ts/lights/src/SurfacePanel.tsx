import { useProject } from './model/ProjectContext'

export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []

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
          {surfaces.map(surface => (
            <div
              key={surface.id}
              className={`surface-item${surface.id === selectedSurfaceId ? ' selected' : ''}`}
              onClick={() => dispatch({ type: 'surface:select', surfaceId: surface.id })}
            >
              <span className="surface-name">{surface.name}</span>
              <button
                className="icon-btn surface-remove"
                title="Remove surface"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'surface:remove', slideId: selectedSlideId, surfaceId: surface.id })
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

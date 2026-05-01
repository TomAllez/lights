import { useProject } from '../model/ProjectContext'
import type { SolidLayer } from '../model/types'
import LayerList from './LayerList'

/**
 * Right sidebar that switches between two modes:
 *
 * - **Stage mode**: lists the surfaces of the current slide with add/remove controls.
 * - **Surface mode**: shows the layer stack for the active surface, a color picker
 *   for the selected solid layer, and an "← Stage" button via the canvas header.
 */
export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId, surfaceMode } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []
  const surface = surfaces.find(s => s.id === selectedSurfaceId)

  // ── Surface mode: layer panel ─────────────────────────────────────────────
  if (surfaceMode && surface && selectedSlideId) {
    const selectedLayer = surface.layers.find(l => l.id === selectedLayerId)
    const solidLayer = selectedLayer?.type === 'solid' ? (selectedLayer as SolidLayer) : undefined

    function addLayer() {
      dispatch({ type: 'layer:add', slideId: selectedSlideId!, surfaceId: surface!.id })
    }

    async function addImageLayer() {
      const src = await window.lights.pickImageFile()
      if (!src) return
      dispatch({ type: 'layer:add-image', slideId: selectedSlideId!, surfaceId: surface!.id, src })
    }

    function removeLayer(layerId: string) {
      dispatch({ type: 'layer:remove', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
    }

    function toggleVisibility(layerId: string) {
      dispatch({ type: 'layer:toggle-visibility', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
    }

    function setColor(color: string) {
      if (!solidLayer) return
      dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...solidLayer, color } })
    }

    return (
      <aside className="surface-panel">
        <div className="surface-panel-header">
          <span>{surface.name}</span>
        </div>

        <LayerList
          surface={surface}
          selectedLayerId={selectedLayerId}
          onSelect={id => dispatch({ type: 'layer:select', layerId: id })}
          onToggleVisibility={toggleVisibility}
          onRemove={removeLayer}
          onReorder={ids => dispatch({ type: 'layer:reorder', slideId: selectedSlideId!, surfaceId: surface!.id, layerIds: ids })}
          onAdd={addLayer}
          onAddImage={addImageLayer}
        />

        {solidLayer && (
          <div className="surface-editor">
            <label className="surface-editor-label">Fill</label>
            <input
              type="color"
              className="surface-editor-color"
              value={solidLayer.color}
              onChange={e => setColor(e.target.value)}
            />
          </div>
        )}
      </aside>
    )
  }

  // ── Stage mode: surface list ──────────────────────────────────────────────
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
                  dispatch({ type: 'surface:remove', slideId: selectedSlideId!, surfaceId: s.id })
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

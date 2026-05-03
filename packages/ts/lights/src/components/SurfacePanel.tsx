import { useState } from 'react'
import { useProject } from '../model/ProjectContext'
import type { SolidLayer, TextLayer } from '../model/types'
import LayerList from './LayerList'
import GraphConfigPanel from './GraphConfigPanel'

/**
 * Right sidebar that switches between two modes:
 *
 * - **Stage mode**: lists the surfaces of the current slide with add/remove controls.
 * - **Surface mode**: shows the layer stack for the active surface, with
 *   contextual property editors for the selected layer type.
 */
export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId, surfaceMode, selectedVolumeId } = state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(surfaceId: string, name: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(surfaceId)
    setEditValue(name)
  }

  function commit(surfaceId: string) {
    const trimmed = editValue.trim()
    if (trimmed && selectedSlideId) dispatch({ type: 'surface:rename', slideId: selectedSlideId, surfaceId, name: trimmed })
    setEditingId(null)
  }

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []
  const volumes = slide?.volumes ?? []
  const surface = surfaces.find(s => s.id === selectedSurfaceId)

  // ── Surface mode: layer panel ─────────────────────────────────────────────
  if (surfaceMode && surface && selectedSlideId) {
    const selectedLayer = surface.layers.find(l => l.id === selectedLayerId)
    const solidLayer = selectedLayer?.type === 'solid' ? (selectedLayer as SolidLayer) : undefined
    const textLayer = selectedLayer?.type === 'text' ? (selectedLayer as TextLayer) : undefined

    function removeLayer(layerId: string) {
      dispatch({ type: 'layer:remove', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
    }

    function toggleVisibility(layerId: string) {
      dispatch({ type: 'layer:toggle-visibility', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
    }

    return (
      <aside className="surface-panel">
        <div className="surface-panel-header">
          {editingId === surface.id ? (
            <input
              autoFocus
              className="rename-input"
              value={editValue}
              onFocus={e => e.target.select()}
              onChange={e => setEditValue(e.target.value)}
              onBlur={() => commit(surface.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <span
              className="surface-panel-title"
              onClick={e => startEdit(surface.id, surface.name, e)}
            >
              {surface.name}
            </span>
          )}
        </div>

        <LayerList
          surface={surface}
          selectedLayerId={selectedLayerId}
          onSelect={id => dispatch({ type: 'layer:select', layerId: id })}
          onToggleVisibility={toggleVisibility}
          onRemove={removeLayer}
          onReorder={ids => dispatch({ type: 'layer:reorder', slideId: selectedSlideId!, surfaceId: surface!.id, layerIds: ids })}
        />

        {solidLayer && (
          <div className="surface-editor">
            <label className="surface-editor-label">Fill</label>
            <input
              type="color"
              className="surface-editor-color"
              value={solidLayer.color}
              onChange={e => dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...solidLayer, color: e.target.value } })}
            />
          </div>
        )}

        {textLayer && (
          <div className="surface-editor">
            <label className="surface-editor-label">Content</label>
            <textarea
              className="surface-editor-textarea"
              value={textLayer.content}
              onChange={e => dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...textLayer, content: e.target.value } })}
            />
            <label className="surface-editor-label">Font size</label>
            <input
              type="range"
              min={8}
              max={200}
              value={textLayer.fontSize}
              onChange={e => dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...textLayer, fontSize: Number(e.target.value) } })}
            />
            <span className="surface-editor-value">{textLayer.fontSize}px</span>
            <label className="surface-editor-label">Color</label>
            <input
              type="color"
              className="surface-editor-color"
              value={textLayer.color}
              onChange={e => dispatch({ type: 'layer:update', slideId: selectedSlideId!, surfaceId: surface!.id, layer: { ...textLayer, color: e.target.value } })}
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
              onClick={() => {
                if (editingId !== s.id) dispatch({ type: 'surface:select', surfaceId: s.id })
              }}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  className="rename-input"
                  value={editValue}
                  onFocus={e => e.target.select()}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commit(s.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="surface-name"
                  onClick={e => {
                    if (s.id === selectedSurfaceId) startEdit(s.id, s.name, e)
                  }}
                >
                  {s.name}
                </span>
              )}
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

      <div className="surface-panel-header" style={{ marginTop: 8 }}>
        <span>Volumes</span>
        {selectedSlideId && (
          <button
            className="icon-btn"
            title="Add paver"
            onClick={() => dispatch({ type: 'volume:add', slideId: selectedSlideId })}
          >
            +
          </button>
        )}
      </div>

      {selectedSlideId && volumes.length > 0 && (
        <div className="surface-list">
          {volumes.map(v => (
            <div
              key={v.id}
              className={`surface-item${v.id === selectedVolumeId ? ' selected' : ''}`}
              onClick={() => dispatch({ type: 'volume:select', volumeId: v.id })}
            >
              <span className="surface-name">{v.name}</span>
              <button
                className="icon-btn surface-remove"
                title="Remove volume"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'volume:remove', slideId: selectedSlideId!, volumeId: v.id })
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <GraphConfigPanel />
    </aside>
  )
}

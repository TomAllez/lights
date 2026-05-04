import { useState } from 'react'
import { useProject } from '../model/ProjectContext'
import type { SolidLayer, TextLayer, VolumeShapeType } from '../model/types'
import LayerList from './LayerList'
import GraphConfigPanel from './GraphConfigPanel'

const SHAPE_TYPES: VolumeShapeType[] = ['box', 'sphere', 'cylinder', 'cone']

/**
 * Right sidebar that switches between two modes:
 *
 * - **Stage mode**: lists the surfaces of the current slide with add/remove controls.
 * - **Surface mode**: shows the layer stack for the active surface, with
 *   contextual property editors for the selected layer type.
 */
export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId, surfaceMode, volumeEditorMode, selectedShapeId } = state
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

  // ── Volume editor mode: shape list ───────────────────────────────────────
  if (volumeEditorMode && slide?.volume && selectedSlideId) {
    const shapes = slide.volume.shapes
    return (
      <aside className="surface-panel">
        <div className="surface-panel-header">
          <span>Shapes</span>
        </div>

        {shapes.length === 0 ? (
          <p className="panel-empty">No shapes</p>
        ) : (
          <div className="surface-list">
            {shapes.map(sh => (
              <div
                key={sh.id}
                className={`surface-item${sh.id === selectedShapeId ? ' selected' : ''}`}
                onClick={() => dispatch({ type: 'volume:shapeSelect', shapeId: sh.id })}
              >
                <span className="surface-name">{sh.name}</span>
                <button
                  className="icon-btn surface-remove"
                  title="Remove shape"
                  onClick={e => {
                    e.stopPropagation()
                    dispatch({ type: 'volume:shapeRemove', slideId: selectedSlideId, shapeId: sh.id })
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="surface-panel-header" style={{ marginTop: 'auto' }}>
          <span>Add shape</span>
        </div>
        <div className="volume-shape-picker">
          {SHAPE_TYPES.map(t => (
            <button
              key={t}
              className="icon-btn volume-shape-btn"
              onClick={() => dispatch({ type: 'volume:shapeAdd', slideId: selectedSlideId, shapeType: t })}
            >
              {t}
            </button>
          ))}
        </div>
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

      <div className="surface-panel-header">
        <span>Volume</span>
        {selectedSlideId && !slide?.volume && (
          <button
            className="icon-btn"
            title="Add volume"
            onClick={() => dispatch({ type: 'volume:add', slideId: selectedSlideId })}
          >
            +
          </button>
        )}
      </div>

      {selectedSlideId && slide?.volume ? (
        <div className="surface-list">
          <div className="surface-item">
            <span className="surface-name">{slide.volume.name}</span>
            <button
              className="icon-btn"
              title="Edit volume"
              onClick={() => dispatch({ type: 'volume:editorEnter' })}
            >
              ✎
            </button>
            <button
              className="icon-btn"
              title="Align camera"
              onClick={() => dispatch({ type: 'volume:alignStart' })}
            >
              ⊹
            </button>
            <button
              className="icon-btn surface-remove"
              title="Remove volume"
              onClick={e => {
                e.stopPropagation()
                dispatch({ type: 'volume:remove', slideId: selectedSlideId })
              }}
            >
              ×
            </button>
          </div>
        </div>
      ) : selectedSlideId ? (
        <p className="panel-empty">No volume</p>
      ) : null}

      <GraphConfigPanel />
    </aside>
  )
}

import { useState } from 'react'
import { useProject } from './model/ProjectContext'
import type { SolidLayer } from './model/types'

export default function SurfacePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId, surfaceMode } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []
  const surface = surfaces.find(s => s.id === selectedSurfaceId)

  // ── Surface mode: layer panel ───────────────────────────────────────────────
  if (surfaceMode && surface && selectedSlideId) {
    const selectedLayer = surface.layers.find(l => l.id === selectedLayerId)
    const solidLayer = selectedLayer?.type === 'solid' ? (selectedLayer as SolidLayer) : undefined

    function addLayer() {
      dispatch({ type: 'layer:add', slideId: selectedSlideId!, surfaceId: surface!.id })
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

  // ── Stage mode: surface list ────────────────────────────────────────────────
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

// ── LayerList ─────────────────────────────────────────────────────────────────

interface LayerListProps {
  surface: { layers: import('./model/types').Layer[] }
  selectedLayerId: string | null
  onSelect: (id: string) => void
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
}

function LayerList({ surface, selectedLayerId, onSelect, onToggleVisibility, onRemove, onReorder, onAdd }: LayerListProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDropIdx(idx)
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx !== null && dragIdx !== targetIdx) {
      const reordered = [...surface.layers]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(targetIdx, 0, moved)
      onReorder(reordered.map(l => l.id))
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  function handleDragEnd() {
    setDragIdx(null)
    setDropIdx(null)
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <span>Layers</span>
        <button className="icon-btn" title="Add layer" onClick={onAdd}>+</button>
      </div>

      {surface.layers.length === 0 ? (
        <p className="panel-empty">No layers</p>
      ) : (
        <div className="layer-list">
          {surface.layers.map((layer, idx) => (
            <div
              key={layer.id}
              className={[
                'layer-item',
                layer.id === selectedLayerId ? 'selected' : '',
                dragIdx === idx ? 'dragging' : '',
                dropIdx === idx && dragIdx !== idx ? 'drop-target' : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(layer.id)}
            >
              <span className="layer-drag-handle">⠿</span>
              <button
                className="icon-btn layer-visibility"
                title={layer.visible ? 'Hide' : 'Show'}
                onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id) }}
              >
                {layer.visible ? '●' : '○'}
              </button>
              <span className="layer-name">{layer.name}</span>
              {layer.type === 'solid' && (
                <span className="layer-color-swatch" style={{ background: (layer as SolidLayer).color }} />
              )}
              <button
                className="icon-btn layer-remove"
                title="Remove layer"
                onClick={e => { e.stopPropagation(); onRemove(layer.id) }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

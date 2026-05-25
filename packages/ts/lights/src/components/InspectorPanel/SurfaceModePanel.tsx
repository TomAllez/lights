import './InspectorPanel.css'
import { useState, useRef } from 'react'
import { Scan } from 'lucide-react'
import { useProject } from '../../contexts'
import type { DetectionCanvasLayer, SolidLayer, TextLayer } from '../../model/types'
import { getRendererIds } from '../../detectionCanvas'
import LayerList from '../LayerList'

export default function SurfaceModePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId, selectedLayerId } = state
  const [editingName, setEditingName] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [showEffectPicker, setShowEffectPicker] = useState(false)
  const solidColorInputRef = useRef<HTMLInputElement>(null)
  const textColorInputRef = useRef<HTMLInputElement>(null)

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surface = slide?.surfaces.find(s => s.id === selectedSurfaceId)

  if (!surface || !selectedSlideId) return null

  const selectedLayer = surface.layers.find(l => l.id === selectedLayerId)
  const solidLayer = selectedLayer?.type === 'solid' ? (selectedLayer as SolidLayer) : undefined
  const textLayer = selectedLayer?.type === 'text' ? (selectedLayer as TextLayer) : undefined
  const detectionLayer = selectedLayer?.type === 'detectionCanvas' ? (selectedLayer as DetectionCanvasLayer) : undefined

  const rendererIds = getRendererIds()

  function startRenameSurface() {
    setEditingName(true)
    setEditValue(surface!.name)
  }

  function commitRenameSurface() {
    const trimmed = editValue.trim()
    if (trimmed && selectedSlideId && selectedSurfaceId) {
      dispatch({ type: 'surface:rename', slideId: selectedSlideId, surfaceId: selectedSurfaceId, name: trimmed })
    }
    setEditingName(false)
  }

  function removeLayer(layerId: string) {
    dispatch({ type: 'layer:remove', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
  }

  function toggleVisibility(layerId: string) {
    dispatch({ type: 'layer:toggle-visibility', slideId: selectedSlideId!, surfaceId: surface!.id, layerId })
  }

  function addSolid() {
    dispatch({ type: 'layer:add', slideId: selectedSlideId!, surfaceId: surface!.id })
  }

  async function addImage() {
    const result = await window.lights.pickImageFile()
    if (!result) return
    dispatch({ type: 'layer:add-image', slideId: selectedSlideId!, surfaceId: surface!.id, src: result.src, name: result.name })
  }

  function addText() {
    dispatch({ type: 'layer:add-text', slideId: selectedSlideId!, surfaceId: surface!.id })
  }

  function addDetectionCanvas(rendererId: string) {
    dispatch({ type: 'layer:add-detection-canvas', slideId: selectedSlideId!, surfaceId: surface!.id, rendererId })
    setShowEffectPicker(false)
  }

  return (
    <aside className="inspector-panel">
      <div className="inspector-header">
        {editingName ? (
          <input
            autoFocus
            className="rename-input"
            value={editValue}
            onFocus={e => e.target.select()}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitRenameSurface}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <span className="inspector-header-name" onDoubleClick={startRenameSurface}>
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
          <div className="color-field">
            <div
              className="color-swatch"
              style={{ background: solidLayer.color }}
              onClick={() => solidColorInputRef.current?.click()}
            />
            <span className="color-value">{solidLayer.color}</span>
            <input
              ref={solidColorInputRef}
              type="color"
              className="color-input-hidden"
              value={solidLayer.color}
              onChange={e => dispatch({
                type: 'layer:update',
                slideId: selectedSlideId!,
                surfaceId: surface!.id,
                layer: { ...solidLayer, color: e.target.value },
              })}
            />
          </div>
        </div>
      )}

      {detectionLayer && (
        <div className="surface-editor">
          <label className="surface-editor-label">Effect</label>
          <select
            className="surface-editor-select"
            value={detectionLayer.rendererId}
            onChange={e => dispatch({
              type: 'layer:update',
              slideId: selectedSlideId!,
              surfaceId: surface!.id,
              layer: { ...detectionLayer, rendererId: e.target.value },
            })}
          >
            {rendererIds.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      )}

      {textLayer && (
        <div className="surface-editor">
          <label className="surface-editor-label">Content</label>
          <textarea
            className="surface-editor-textarea"
            value={textLayer.content}
            onChange={e => dispatch({
              type: 'layer:update',
              slideId: selectedSlideId!,
              surfaceId: surface!.id,
              layer: { ...textLayer, content: e.target.value },
            })}
          />
          <label className="surface-editor-label">Font size</label>
          <div className="prop-row">
            <input
              type="range"
              min={8}
              max={200}
              value={textLayer.fontSize}
              onChange={e => dispatch({
                type: 'layer:update',
                slideId: selectedSlideId!,
                surfaceId: surface!.id,
                layer: { ...textLayer, fontSize: Number(e.target.value) },
              })}
            />
            <input
              type="number"
              className="prop-number"
              min={8}
              max={200}
              value={textLayer.fontSize}
              onChange={e => dispatch({
                type: 'layer:update',
                slideId: selectedSlideId!,
                surfaceId: surface!.id,
                layer: { ...textLayer, fontSize: Number(e.target.value) },
              })}
            />
          </div>
          <label className="surface-editor-label">Color</label>
          <div className="color-field">
            <div
              className="color-swatch"
              style={{ background: textLayer.color }}
              onClick={() => textColorInputRef.current?.click()}
            />
            <span className="color-value">{textLayer.color}</span>
            <input
              ref={textColorInputRef}
              type="color"
              className="color-input-hidden"
              value={textLayer.color}
              onChange={e => dispatch({
                type: 'layer:update',
                slideId: selectedSlideId!,
                surfaceId: surface!.id,
                layer: { ...textLayer, color: e.target.value },
              })}
            />
          </div>
        </div>
      )}

      <div className="add-layer-footer">
        <button className="add-layer-btn" onClick={addSolid}>+ Solid</button>
        <button className="add-layer-btn" onClick={addImage}>+ Image</button>
        <button className="add-layer-btn" onClick={addText}>+ Text</button>
        <div className="effect-picker-wrapper">
          <button
            className="add-layer-btn"
            disabled={rendererIds.length === 0}
            onClick={() => setShowEffectPicker(v => !v)}
          >
            + Effect
          </button>
          {showEffectPicker && rendererIds.length > 0 && (
            <div className="layer-tool-picker">
              {rendererIds.map(id => (
                <button key={id} className="layer-tool-picker-item" onClick={() => addDetectionCanvas(id)}>
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

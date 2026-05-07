import './LayerToolbar.css'
import { useState } from 'react'
import { Square, Image as ImageIcon, Type, Scan } from 'lucide-react'
import { useProject } from '../../model'
import { getRendererIds } from '../../detectionCanvas'

export default function LayerToolbar() {
  const { state, dispatch } = useProject()
  const { editorMode, selectedSlideId, selectedSurfaceId } = state
  const [showPicker, setShowPicker] = useState(false)

  if (editorMode !== 'surface' || !selectedSlideId || !selectedSurfaceId) return null

  const rendererIds = getRendererIds()

  function addSolid() {
    dispatch({ type: 'layer:add', slideId: selectedSlideId!, surfaceId: selectedSurfaceId! })
  }

  async function addImage() {
    const result = await window.lights.pickImageFile()
    if (!result) return
    dispatch({ type: 'layer:add-image', slideId: selectedSlideId!, surfaceId: selectedSurfaceId!, src: result.src, name: result.name })
  }

  function addText() {
    dispatch({ type: 'layer:add-text', slideId: selectedSlideId!, surfaceId: selectedSurfaceId! })
  }

  function addDetectionCanvas(rendererId: string) {
    dispatch({ type: 'layer:add-detection-canvas', slideId: selectedSlideId!, surfaceId: selectedSurfaceId!, rendererId })
    setShowPicker(false)
  }

  return (
    <aside className="layer-toolbar">
      <button className="layer-tool-btn" title="Add solid layer" onClick={addSolid}>
        <Square size={20} />
      </button>
      <button className="layer-tool-btn" title="Add image layer" onClick={addImage}>
        <ImageIcon size={20} />
      </button>
      <button className="layer-tool-btn" title="Add text layer" onClick={addText}>
        <Type size={20} />
      </button>

      <div className="layer-tool-detection">
        <button
          className={`layer-tool-btn${showPicker ? ' active' : ''}`}
          title="Add detection canvas"
          disabled={rendererIds.length === 0}
          onClick={() => setShowPicker(v => !v)}
        >
          <Scan size={20} />
        </button>
        {showPicker && rendererIds.length > 0 && (
          <div className="layer-tool-picker">
            {rendererIds.map(id => (
              <button key={id} className="layer-tool-picker-item" onClick={() => addDetectionCanvas(id)}>
                {id}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

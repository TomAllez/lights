import { useProject } from '../model'
import { Square, Image as ImageIcon, Type } from 'lucide-react'

export default function LayerToolbar() {
  const { state, dispatch } = useProject()
  const { editorMode, selectedSlideId, selectedSurfaceId } = state

  if (editorMode !== 'surface' || !selectedSlideId || !selectedSurfaceId) return null

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
    </aside>
  )
}

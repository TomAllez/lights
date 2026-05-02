import { useProject } from '../model'

function IconSolid() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="16" rx="2.5" fill="currentColor" />
    </svg>
  )
}

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="9" r="1.75" fill="currentColor" />
      <path d="M3 15 L7.5 10.5 L11.5 14 L15 11 L21 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconText() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 6h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 6v12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function LayerToolbar() {
  const { state, dispatch } = useProject()
  const { surfaceMode, selectedSlideId, selectedSurfaceId } = state

  if (!surfaceMode || !selectedSlideId || !selectedSurfaceId) return null

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
        <IconSolid />
      </button>
      <button className="layer-tool-btn" title="Add image layer" onClick={addImage}>
        <IconImage />
      </button>
      <button className="layer-tool-btn" title="Add text layer" onClick={addText}>
        <IconText />
      </button>
    </aside>
  )
}

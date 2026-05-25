import { useProject } from '../../contexts'
import './Breadcrumb.css'

export default function Breadcrumb() {
  const { state, dispatch } = useProject()
  const { editorMode, selectedSlideId, selectedSurfaceId, project } = state

  if (editorMode === 'stage') return null

  const currentSlide = project.slides.find(s => s.id === selectedSlideId)
  const currentSurface = currentSlide?.surfaces.find(s => s.id === selectedSurfaceId)

  if (editorMode === 'surface') {
    return (
      <nav className="breadcrumb">
        <span
          className="breadcrumb-item breadcrumb-item--link"
          onClick={() => dispatch({ type: 'surface:exit' })}
        >
          {currentSlide?.name ?? 'Slide'}
        </span>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-item">{currentSurface?.name ?? 'Surface'}</span>
      </nav>
    )
  }

  if (editorMode === 'volume-editor') {
    return (
      <nav className="breadcrumb">
        <span
          className="breadcrumb-item breadcrumb-item--link"
          onClick={() => dispatch({ type: 'volume:editorExit' })}
        >
          {currentSlide?.name ?? 'Slide'}
        </span>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-item">Volume</span>
      </nav>
    )
  }

  if (editorMode === 'volume-align') {
    return (
      <nav className="breadcrumb">
        <span className="breadcrumb-item">{currentSlide?.name ?? 'Slide'}</span>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-item">Align Camera</span>
      </nav>
    )
  }

  return null
}

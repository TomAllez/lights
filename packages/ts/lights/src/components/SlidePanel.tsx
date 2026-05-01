import { useProject } from '../model/ProjectContext'

/**
 * Left sidebar panel displaying the slide list.
 * Supports adding, removing, and selecting slides.
 */
export default function SlidePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId } = state

  return (
    <aside className="slide-panel">
      <div className="slide-panel-header">
        <span>Slides</span>
        <button
          className="icon-btn"
          title="Add slide"
          onClick={() => dispatch({ type: 'slide:add' })}
        >
          +
        </button>
      </div>

      {project.slides.length === 0 ? (
        <p className="panel-empty">No slides</p>
      ) : (
        <div className="slide-list">
          {project.slides.map(slide => (
            <div
              key={slide.id}
              className={`slide-item${slide.id === selectedSlideId ? ' selected' : ''}`}
              onClick={() => dispatch({ type: 'slide:select', slideId: slide.id })}
            >
              <span className="slide-name">{slide.name}</span>
              <button
                className="icon-btn slide-action"
                title="Duplicate slide"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'slide:duplicate', slideId: slide.id })
                }}
              >
                ⎘
              </button>
              <button
                className="icon-btn slide-action slide-remove"
                title="Remove slide"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'slide:remove', slideId: slide.id })
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

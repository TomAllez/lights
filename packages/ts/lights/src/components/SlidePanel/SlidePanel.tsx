import './SlidePanel.css'
import { useState } from 'react'
import { useProject } from '../../contexts'

export default function SlidePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId } = state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(slideId: string, name: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(slideId)
    setEditValue(name)
  }

  function commit(slideId: string) {
    const trimmed = editValue.trim()
    if (trimmed) dispatch({ type: 'slide:rename', slideId, name: trimmed })
    setEditingId(null)
  }

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
              onClick={() => {
                if (editingId !== slide.id) dispatch({ type: 'slide:select', slideId: slide.id })
              }}
            >
              {editingId === slide.id ? (
                <input
                  autoFocus
                  className="rename-input"
                  value={editValue}
                  onFocus={e => e.target.select()}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commit(slide.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="slide-name"
                  onClick={e => {
                    if (slide.id === selectedSlideId) startEdit(slide.id, slide.name, e)
                  }}
                >
                  {slide.name}
                </span>
              )}
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

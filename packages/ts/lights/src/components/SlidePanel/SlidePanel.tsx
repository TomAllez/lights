import './SlidePanel.css'
import { useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { useProject } from '../../contexts'

export default function SlidePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId } = state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  function startRename(slideId: string, currentName: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(slideId)
    setEditValue(currentName)
  }

  function commitRename(slideId: string) {
    const trimmedName = editValue.trim()
    if (trimmedName) dispatch({ type: 'slide:rename', slideId, name: trimmedName })
    setEditingId(null)
  }

  return (
    <aside className="slide-panel">
      <div className="slide-panel-header">
        <span>SLIDES</span>
      </div>

      <div className="slide-list">
        {project.slides.map(slide => {
          const isSelected = slide.id === selectedSlideId
          const isEditing = editingId === slide.id

          return (
            <div
              key={slide.id}
              className={`slide-card${isSelected ? ' selected' : ''}`}
              onClick={() => {
                if (!isEditing) dispatch({ type: 'slide:select', slideId: slide.id })
              }}
            >
              <div className="slide-thumb">
                <div className="slide-card-actions">
                  <button
                    className="icon-btn"
                    title="Duplicate slide"
                    onClick={e => {
                      e.stopPropagation()
                      dispatch({ type: 'slide:duplicate', slideId: slide.id })
                    }}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    className="icon-btn slide-remove"
                    title="Remove slide"
                    onClick={e => {
                      e.stopPropagation()
                      dispatch({ type: 'slide:remove', slideId: slide.id })
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {isEditing ? (
                <input
                  autoFocus
                  className="rename-input"
                  value={editValue}
                  onFocus={e => e.target.select()}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitRename(slide.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="slide-card-name"
                  onDoubleClick={e => startRename(slide.id, slide.name, e)}
                >
                  {slide.name}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <button
        className="slide-add-btn"
        onClick={() => dispatch({ type: 'slide:add' })}
      >
        + New Slide
      </button>
    </aside>
  )
}

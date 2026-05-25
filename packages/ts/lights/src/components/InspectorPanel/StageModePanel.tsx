import './InspectorPanel.css'
import { useState } from 'react'
import { Box, Layers, MousePointer, Square, Trash2, Pencil, Crosshair, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useProject } from '../../contexts'
import GraphConfigPanel from '../GraphConfigPanel'

function EmptyState({ icon: Icon, message, action }: {
  icon: LucideIcon
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="empty-state">
      <Icon size={20} className="empty-state-icon" />
      <span className="empty-state-msg">{message}</span>
      {action && <button className="empty-state-btn" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}

interface PanelSectionProps {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}

function PanelSection({ title, action, children }: PanelSectionProps) {
  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <span>{title}</span>
        {action && <div>{action}</div>}
      </div>
      <div className="panel-section-body">{children}</div>
    </div>
  )
}

export default function StageModePanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedSurfaceId } = state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isModulesExpanded, setIsModulesExpanded] = useState(false)

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const surfaces = slide?.surfaces ?? []

  function startRename(surfaceId: string, currentName: string, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(surfaceId)
    setEditValue(currentName)
  }

  function commitRename(surfaceId: string) {
    const trimmed = editValue.trim()
    if (trimmed && selectedSlideId) {
      dispatch({ type: 'surface:rename', slideId: selectedSlideId, surfaceId, name: trimmed })
    }
    setEditingId(null)
  }

  const surfaceAddButton = selectedSlideId ? (
    <button
      className="icon-btn"
      title="Add surface"
      onClick={() => dispatch({ type: 'surface:add', slideId: selectedSlideId })}
    >
      <Plus size={12} />
    </button>
  ) : undefined

  return (
    <aside className="inspector-panel">
      <PanelSection title="SURFACES" action={surfaceAddButton}>
        {!selectedSlideId ? (
          <EmptyState icon={MousePointer} message="Select a slide to begin" />
        ) : surfaces.length === 0 ? (
          <EmptyState
            icon={Square}
            message="No surfaces"
            action={{ label: 'Add Surface', onClick: () => dispatch({ type: 'surface:add', slideId: selectedSlideId! }) }}
          />
        ) : (
          surfaces.map(s => (
            <div
              key={s.id}
              className={`inspector-surface-item${s.id === selectedSurfaceId ? ' selected' : ''}`}
              onClick={() => {
                if (editingId !== s.id) dispatch({ type: 'surface:select', surfaceId: s.id })
              }}
            >
              <Layers size={12} />
              {editingId === s.id ? (
                <input
                  autoFocus
                  className="rename-input"
                  value={editValue}
                  onFocus={e => e.target.select()}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="inspector-surface-name"
                  onDoubleClick={e => { e.stopPropagation(); startRename(s.id, s.name, e) }}
                >
                  {s.name}
                </span>
              )}
              <button
                className="icon-btn inspector-surface-remove"
                title="Remove surface"
                onClick={e => {
                  e.stopPropagation()
                  dispatch({ type: 'surface:remove', slideId: selectedSlideId!, surfaceId: s.id })
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </PanelSection>

      <PanelSection
        title="VOLUME"
        action={
          selectedSlideId && !slide?.volume ? (
            <button
              className="icon-btn"
              title="Add volume"
              onClick={() => dispatch({ type: 'volume:add', slideId: selectedSlideId })}
            >
              <Plus size={12} />
            </button>
          ) : undefined
        }
      >
        {selectedSlideId && slide?.volume ? (
          <div className="inspector-surface-item">
            <span className="inspector-surface-name">{slide.volume.name}</span>
            <button
              className="icon-btn"
              title="Edit volume"
              onClick={() => dispatch({ type: 'volume:editorEnter' })}
            >
              <Pencil size={12} />
            </button>
            <button
              className="icon-btn"
              title="Align camera"
              onClick={() => dispatch({ type: 'volume:alignStart' })}
            >
              <Crosshair size={12} />
            </button>
            <button
              className="icon-btn inspector-surface-remove"
              title="Remove volume"
              onClick={e => {
                e.stopPropagation()
                dispatch({ type: 'volume:remove', slideId: selectedSlideId! })
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : selectedSlideId ? (
          <EmptyState
            icon={Box}
            message="No volume"
            action={{ label: 'Add Volume', onClick: () => dispatch({ type: 'volume:add', slideId: selectedSlideId! }) }}
          />
        ) : null}
      </PanelSection>

      <div className="panel-section">
        <div
          className="panel-section-header is-collapsible"
          onClick={() => setIsModulesExpanded(v => !v)}
        >
          <span>ML MODULES</span>
          <div>
            {isModulesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>
        </div>
        {isModulesExpanded && (
          <div className="panel-section-body">
            <GraphConfigPanel />
          </div>
        )}
      </div>
    </aside>
  )
}

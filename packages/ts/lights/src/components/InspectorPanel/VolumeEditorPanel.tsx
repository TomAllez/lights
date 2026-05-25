import './InspectorPanel.css'
import { Trash2 } from 'lucide-react'
import { useProject } from '../../contexts'
import type { VolumeShapeType } from '../../model/types'

const SHAPE_TYPES: VolumeShapeType[] = ['box', 'sphere', 'cylinder', 'cone', 'grid']

export default function VolumeEditorPanel() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedShapeId } = state

  const slide = project.slides.find(s => s.id === selectedSlideId)

  if (!slide?.volume || !selectedSlideId) return null

  const shapes = slide.volume.shapes
  const selectedShape = shapes.find(s => s.id === selectedShapeId)

  function updateShape(patch: Partial<import('../../model/types').VolumeShape>) {
    if (selectedShape && selectedSlideId) {
      dispatch({
        type: 'volume:shapeUpdate',
        slideId: selectedSlideId,
        shape: { ...selectedShape, ...patch },
      })
    }
  }

  return (
    <aside className="inspector-panel">
      <div className="panel-section">
        <div className="panel-section-header">
          <span>SHAPES</span>
        </div>
        <div className="panel-section-body">
          <div className="shape-list">
            {shapes.length === 0 ? (
              <p className="panel-empty">No shapes</p>
            ) : (
              shapes.map(sh => (
                <div
                  key={sh.id}
                  className={`inspector-surface-item${sh.id === selectedShapeId ? ' selected' : ''}`}
                  onClick={() => dispatch({ type: 'volume:shapeSelect', shapeId: sh.id })}
                >
                  <span className="inspector-surface-name">{sh.name}</span>
                  <button
                    className="icon-btn inspector-surface-remove"
                    title="Remove shape"
                    onClick={e => {
                      e.stopPropagation()
                      dispatch({ type: 'volume:shapeRemove', slideId: selectedSlideId, shapeId: sh.id })
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedShape && (
        <div className="panel-section">
          <div className="panel-section-header">
            <span>PROPERTIES</span>
          </div>
          <div className="panel-section-body">
            <div className="surface-editor">
              <label className="surface-editor-label">Position</label>
              <div className="xyz-grid">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <>
                    <span key={`pos-axis-${axis}`} className="xyz-axis">{axis.toUpperCase()}</span>
                    <input
                      key={`pos-input-${axis}`}
                      type="number"
                      step={0.1}
                      className="xyz-input"
                      value={selectedShape.position[axis]}
                      onChange={e => updateShape({ position: { ...selectedShape.position, [axis]: Number(e.target.value) } })}
                    />
                  </>
                ))}
              </div>

              <label className="surface-editor-label">Rotation</label>
              <div className="xyz-grid">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <>
                    <span key={`rot-axis-${axis}`} className="xyz-axis">{axis.toUpperCase()}</span>
                    <input
                      key={`rot-input-${axis}`}
                      type="number"
                      step={1}
                      className="xyz-input"
                      value={selectedShape.rotation[axis]}
                      onChange={e => updateShape({ rotation: { ...selectedShape.rotation, [axis]: Number(e.target.value) } })}
                    />
                  </>
                ))}
              </div>

              <label className="surface-editor-label">Scale</label>
              <div className="xyz-grid">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <>
                    <span key={`scale-axis-${axis}`} className="xyz-axis">{axis.toUpperCase()}</span>
                    <input
                      key={`scale-input-${axis}`}
                      type="number"
                      step={0.1}
                      className="xyz-input"
                      value={selectedShape.scale[axis]}
                      onChange={e => updateShape({ scale: { ...selectedShape.scale, [axis]: Number(e.target.value) } })}
                    />
                  </>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel-section">
        <div className="panel-section-header">
          <span>ADD SHAPE</span>
        </div>
        <div className="panel-section-body">
          <div className="add-shape-footer">
            {SHAPE_TYPES.map(shapeType => (
              <button
                key={shapeType}
                className="add-layer-btn"
                onClick={() => dispatch({ type: 'volume:shapeAdd', slideId: selectedSlideId, shapeType })}
              >
                {shapeType}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}

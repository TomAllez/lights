import { useState } from 'react'
import { useProject } from '../model/ProjectContext'
import type { Paver, PaverDimensions } from '../model/types'

interface Props {
  paver: Paver
  slideId: string
  onOpenEditor: () => void
}

export default function PaverPanel({ paver, slideId, onOpenEditor }: Props) {
  const { dispatch } = useProject()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  function commitName() {
    const trimmed = nameValue.trim()
    if (trimmed) dispatch({ type: 'volume:rename', slideId, volumeId: paver.id, name: trimmed })
    setEditingName(false)
  }

  function setDim(field: keyof PaverDimensions, raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v > 0) {
      dispatch({
        type: 'volume:updateDimensions',
        slideId,
        volumeId: paver.id,
        dimensions: { ...paver.dimensions, [field]: v },
      })
    }
  }

  const { width, height, depth } = paver.dimensions

  return (
    <div className="paver-panel">
      <div className="surface-panel-header">
        {editingName ? (
          <input
            autoFocus
            className="rename-input"
            value={nameValue}
            onFocus={e => e.target.select()}
            onChange={e => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <span
            className="surface-panel-title"
            onClick={() => { setNameValue(paver.name); setEditingName(true) }}
          >
            {paver.name}
          </span>
        )}
      </div>

      <div className="surface-editor">
        <label className="surface-editor-label">Width</label>
        <input
          type="number" min="0.01" step="0.1"
          className="surface-editor-input"
          defaultValue={width}
          key={`w-${paver.id}`}
          onBlur={e => setDim('width', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <label className="surface-editor-label">Height</label>
        <input
          type="number" min="0.01" step="0.1"
          className="surface-editor-input"
          defaultValue={height}
          key={`h-${paver.id}`}
          onBlur={e => setDim('height', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        <label className="surface-editor-label">Depth</label>
        <input
          type="number" min="0.01" step="0.1"
          className="surface-editor-input"
          defaultValue={depth}
          key={`d-${paver.id}`}
          onBlur={e => setDim('depth', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
      </div>

      <div className="paver-cubes-section">
        <div className="paver-cubes-header">
          <span>Cubes ({paver.cubes.length})</span>
          <button className="icon-btn" title="Open 3D editor" onClick={onOpenEditor}>
            ⬡
          </button>
        </div>
        {paver.cubes.length === 0 ? (
          <p className="panel-empty">No cubes — open editor to place</p>
        ) : (
          <div className="paver-cube-list">
            {paver.cubes.map((cube, i) => (
              <div key={cube.id} className="paver-cube-item">
                <span className="paver-cube-label">
                  Cube {i + 1} ({cube.position.map(n => n.toFixed(1)).join(', ')})
                </span>
                <button
                  className="icon-btn surface-remove"
                  title="Remove cube"
                  onClick={() => dispatch({ type: 'volume:removeCube', slideId, volumeId: paver.id, cubeId: cube.id })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="paver-editor-btn-row">
        <button className="paver-open-editor-btn" onClick={onOpenEditor}>
          Open 3D Editor
        </button>
      </div>
    </div>
  )
}

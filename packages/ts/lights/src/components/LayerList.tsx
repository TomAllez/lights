import { useState } from 'react'
import type { ImageLayer, Layer, ShaderLayer, SolidLayer, TextLayer } from '../model/types'

interface LayerListProps {
  surface: { layers: Layer[] }
  selectedLayerId: string | null
  onSelect: (id: string) => void
  onToggleVisibility: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (ids: string[]) => void
}

export default function LayerList({
  surface,
  selectedLayerId,
  onSelect,
  onToggleVisibility,
  onRemove,
  onReorder,
}: LayerListProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDropIdx(idx)
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx !== null && dragIdx !== targetIdx) {
      const reordered = [...surface.layers]
      const [moved] = reordered.splice(dragIdx, 1)
      reordered.splice(targetIdx, 0, moved)
      onReorder(reordered.map(l => l.id))
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  function handleDragEnd() {
    setDragIdx(null)
    setDropIdx(null)
  }

  return (
    <div className="layer-panel">
      {surface.layers.length === 0 ? (
        <p className="panel-empty">No layers</p>
      ) : (
        <div className="layer-list">
          {surface.layers.map((layer, idx) => (
            <div
              key={layer.id}
              className={[
                'layer-item',
                layer.id === selectedLayerId ? 'selected' : '',
                dragIdx === idx ? 'dragging' : '',
                dropIdx === idx && dragIdx !== idx ? 'drop-target' : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelect(layer.id)}
            >
              <span className="layer-drag-handle">⠿</span>
              <button
                className="icon-btn layer-visibility"
                title={layer.visible ? 'Hide' : 'Show'}
                onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id) }}
              >
                {layer.visible ? '●' : '○'}
              </button>
              <span className="layer-name">{layer.name}</span>
              {layer.type === 'solid' && (
                <span className="layer-color-swatch" style={{ background: (layer as SolidLayer).color }} />
              )}
              {layer.type === 'image' && (
                <img
                  className="layer-thumbnail"
                  src={(layer as ImageLayer).src}
                  alt=""
                  draggable={false}
                />
              )}
              {layer.type === 'text' && (
                <span className="layer-text-badge" style={{ color: (layer as TextLayer).color }}>T</span>
              )}
              {layer.type === 'shader' && (
                <span className="layer-text-badge" style={{ color: '#7c6af7' }}>{(layer as ShaderLayer).preset[0].toUpperCase()}</span>
              )}
              <button
                className="icon-btn layer-remove"
                title="Remove layer"
                onClick={e => { e.stopPropagation(); onRemove(layer.id) }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

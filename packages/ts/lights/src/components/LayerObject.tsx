import type { ImageLayer, Layer, SolidLayer } from '../model/types'

// ── Types ─────────────────────────────────────────────────────────────────────

/** The four corner identifiers used for resize handles. */
export type Corner = 'tl' | 'tr' | 'br' | 'bl'

interface LayerObjectProps {
  layer: Layer
  canvasW: number
  canvasH: number
  isSelected: boolean
  onMoveStart: (e: React.PointerEvent) => void
  onResizeStart: (e: React.PointerEvent, corner: Corner) => void
  onRotateStart: (e: React.PointerEvent) => void
  onSelect: () => void
}

const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl']

function toFileUrl(src: string): string {
  return src.startsWith('data:') || src.startsWith('file://') ? src : `file://${src}`
}

/**
 * A single layer rendered as a positioned, rotated div inside the surface
 * canvas. When selected it shows four corner resize handles, a rotation handle
 * above center, and a connecting line to the rotation handle.
 *
 * All transform values (`x`, `y`, `w`, `h`) are normalized [0,1] in surface-local
 * space; this component converts them to pixel offsets based on `canvasW/H`.
 */
export default function LayerObject({
  layer,
  canvasW,
  canvasH,
  isSelected,
  onMoveStart,
  onResizeStart,
  onRotateStart,
  onSelect,
}: LayerObjectProps) {
  const t = layer.transform

  const bgStyle: React.CSSProperties =
    layer.type === 'solid'
      ? { background: (layer as SolidLayer).color }
      : layer.type === 'image'
        ? {
            backgroundImage: `url("${toFileUrl((layer as ImageLayer).src)}")`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
          }
        : {}

  return (
    <div
      className={`layer-object${isSelected ? ' layer-object--selected' : ''}`}
      style={{
        left: t.x * canvasW,
        top: t.y * canvasH,
        width: t.w * canvasW,
        height: t.h * canvasH,
        transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
        ...bgStyle,
      }}
      onPointerDown={e => { e.stopPropagation(); onSelect(); onMoveStart(e) }}
    >
      {isSelected && (
        <>
          {CORNERS.map(corner => (
            <div
              key={corner}
              className={`layer-handle layer-handle--resize-${corner}`}
              onPointerDown={e => { e.stopPropagation(); onResizeStart(e, corner) }}
            />
          ))}
          <div className="layer-rotate-line" />
          <div
            className="layer-handle layer-handle--rotate"
            onPointerDown={e => { e.stopPropagation(); onRotateStart(e) }}
          />
        </>
      )}
    </div>
  )
}

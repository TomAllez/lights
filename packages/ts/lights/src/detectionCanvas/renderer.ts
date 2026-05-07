import type { TypedDetectionEvent } from '../ipc/detectionTypes'
import type { LayerTransform } from '@lights/three-scene'

export interface DetectionCanvasRenderer {
  /**
   * Called on every incoming detection. Use this to update internal state
   * (e.g. latest landmark positions, spawn particles). Renderers receive ALL
   * detections — filter by `event.kind` or `event.moduleId` as needed.
   */
  onDetection(event: TypedDetectionEvent): void

  /**
   * Draw into the surface compositor canvas. Coordinates are in surface-local
   * pixel space: (0,0) = top-left of surface, (w,h) = bottom-right.
   * `transform` is the layer's bounding rect in normalized [0,1] surface
   * coordinates — use it to anchor your drawing.
   * `dt` is milliseconds since the last render call.
   */
  render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    transform: LayerTransform,
    dt: number,
  ): void

  dispose(): void
}

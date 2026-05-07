export type { DetectionCanvasRenderer } from './renderer'
export { registerRenderer, createRenderer, getRendererIds } from './registry'

// Side-effect imports — register all built-in effects on module load
import './effects'

export interface Point {
  x: number
  y: number
}

export interface Pattern {
  width: number
  height: number
  data: ArrayBuffer
}

export enum GraphStatus {
  Running = 'running',
  Stopped = 'stopped',
  Error = 'error',
}

export interface GraphConfig {
  modules: Record<string, { enabled: boolean; params?: Record<string, unknown> }>
}

export type AOIMap = Record<string, Point[]>

export interface SurfaceGeometry {
  id: string
  name: string
  outputPolygon: Point[]
}

// *Claude* : I think we will need to make a context for useGraph as well ? What do you think ?
export type GraphCommand =
  | { type: 'calibration:start' }
  | { type: 'calibration:stop' }
  | { type: 'slide:activate'; config: GraphConfig; aois: AOIMap }
  | { type: 'module:setParams'; moduleId: string; params: Record<string, unknown> }
  | { type: 'graph:stop' }

export type GraphEvent =
  | { type: 'calibration:project'; pattern: Pattern }
  | { type: 'calibration:result'; surfaces: SurfaceGeometry[] }
  | { type: 'frame'; width: number; height: number; data: ArrayBuffer }
  | { type: 'detection'; moduleId: string; position: Point; data: ArrayBuffer }
  | { type: 'graph:status'; status: GraphStatus }

export interface LightsBridge {
  sendCommand: (cmd: GraphCommand) => void
  onEvent: (handler: (event: GraphEvent) => void) => () => void
  sendSlide: (slide: unknown) => void
  onOutputRender: (handler: (slide: unknown) => void) => () => void
  /** Open the native OS file picker filtered to image types. Returns name + base64 data URL, or null if cancelled. */
  pickImageFile: () => Promise<{ name: string; src: string } | null>
}

declare global {
  interface Window {
    lights: LightsBridge
  }
}

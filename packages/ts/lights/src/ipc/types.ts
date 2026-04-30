export interface Point {
  x: number
  y: number
}

export interface Pattern {
  width: number
  height: number
  data: ArrayBuffer
}

export interface GraphConfig {
  modules: Record<string, { enabled: boolean; params?: Record<string, unknown> }>
}

export type AOIMap = Record<string, Point[]>

export interface Surface {
  id: string
  name: string
  outputPolygon: Point[]
}

export type GraphCommand =
  | { type: 'calibration:start' }
  | { type: 'calibration:stop' }
  | { type: 'slide:activate'; config: GraphConfig; aois: AOIMap }
  | { type: 'module:setParams'; moduleId: string; params: Record<string, unknown> }
  | { type: 'graph:stop' }

export type GraphEvent =
  | { type: 'calibration:project'; pattern: Pattern }
  | { type: 'calibration:result'; surfaces: Surface[] }
  | { type: 'frame'; width: number; height: number; data: ArrayBuffer }
  | { type: 'detection'; moduleId: string; position: Point; data: unknown }
  | { type: 'graph:status'; status: 'running' | 'stopped' | 'error' }

export interface LightsBridge {
  sendCommand: (cmd: GraphCommand) => void
  onEvent: (handler: (event: GraphEvent) => void) => () => void
}

declare global {
  interface Window {
    lights: LightsBridge
  }
}

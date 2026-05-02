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

  // Project persistence
  /** Save project to the current file path (or show Save dialog if none). Returns the file path used, or null if cancelled. */
  saveProject: (project: unknown) => Promise<{ filePath: string } | null>
  /** Always shows a Save As dialog. Returns the file path used, or null if cancelled. */
  saveProjectAs: (project: unknown) => Promise<{ filePath: string } | null>
  /** Notify main of unsaved-changes state (used for close confirmation). */
  notifyDirty: (isDirty: boolean) => void
  /** Tell main the renderer is ready to quit (called after successful save-and-quit). */
  confirmQuit: () => void

  // Menu events (main → renderer)
  onMenuSave: (handler: () => void) => () => void
  onMenuSaveAs: (handler: () => void) => () => void
  onMenuSaveAndQuit: (handler: () => void) => () => void
  onMenuNew: (handler: () => void) => () => void
  onProjectOpened: (handler: (data: { project: unknown; filePath: string }) => void) => () => void
}

declare global {
  interface Window {
    lights: LightsBridge
  }
}

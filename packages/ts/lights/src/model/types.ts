import type { Point, GraphConfig } from '../ipc/types'

export type { Point, GraphConfig }

export type Polygon = Point[]

// ── Volume types ─────────────────────────────────────────────────────────────

export interface PaverDimensions {
  width: number   // X, arbitrary units
  height: number  // Y
  depth: number   // Z
}

// 0-3: front face (z = -depth/2) TL→TR→BR→BL
// 4-7: back face  (z = +depth/2) TL→TR→BR→BL
export type PaverCorners = [Point, Point, Point, Point, Point, Point, Point, Point]

export interface PaverCube {
  id: string
  position: [number, number, number]
}

export interface Paver {
  id: string
  name: string
  kind: 'paver'
  dimensions: PaverDimensions
  stageCorners: PaverCorners
  cubes: PaverCube[]
}

export type Volume = Paver

export interface LayerTransform {
  x: number        // center, normalized [0,1]
  y: number        // center, normalized [0,1]
  w: number        // width fraction [0,1]
  h: number        // height fraction [0,1]
  rotation: number // degrees
}

export interface SolidLayer { id: string; type: 'solid'; name: string; visible: boolean; color: string; transform: LayerTransform }

/** Image layer — src is an absolute file path (or data: URL when serialised). */
export interface ImageLayer { id: string; type: 'image'; name: string; visible: boolean; src: string; transform: LayerTransform }

export interface TextLayer { id: string; type: 'text'; name: string; visible: boolean; content: string; fontSize: number; color: string; transform: LayerTransform }

export type Layer = SolidLayer | ImageLayer | TextLayer

export interface Reaction { id: string }
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Calibration {} // populated by M5 (camera-to-projector mapping)

export interface Surface {
  id: string
  name: string
  outputPolygon: [Point, Point, Point, Point]
  areaOfInterest?: Polygon
  layers: Layer[]
  reactions: Reaction[]
}

export interface Slide {
  id: string
  name: string
  surfaces: Surface[]
  volumes: Volume[]
  graphConfig: GraphConfig
}

export interface Project {
  slides: Slide[]
  calibration: Calibration
}

export function deriveAOIs(surfaces: Surface[]): Record<string, Polygon> {
  const map: Record<string, Polygon> = {}
  for (const s of surfaces) {
    if (s.areaOfInterest) map[s.id] = s.areaOfInterest
  }
  return map
}

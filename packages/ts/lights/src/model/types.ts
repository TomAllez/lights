import type { Point, GraphConfig } from '../ipc/types'

export type { Point, GraphConfig }

export type Polygon = Point[]

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

export type Layer = SolidLayer | ImageLayer

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

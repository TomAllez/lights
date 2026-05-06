import type { Point as BasePoint, GraphConfig } from '../ipc/types'
import type {
  VolumeShapeType, VolumeEditMode, Vec3, VolumeCamera,
  VolumeShape as BaseVolumeShape, Volume as BaseVolume,
  SolidLayer as BaseSolidLayer, ImageLayer as BaseImageLayer, TextLayer as BaseTextLayer,
  ShaderLayer as BaseShaderLayer, ShaderPreset,
  LayerTransform as BaseLayerTransform, Point, Surface as BaseSurface
} from '@lights/three-scene'

export type { GraphConfig, VolumeShapeType, VolumeEditMode, Vec3, VolumeCamera, Point, ShaderPreset }

export type Polygon = BasePoint[]

export interface LayerTransform extends BaseLayerTransform {
  rotation: number // degrees
}

export interface SolidLayer extends BaseSolidLayer { transform: LayerTransform }
export interface ImageLayer extends BaseImageLayer { transform: LayerTransform }
export interface TextLayer extends BaseTextLayer { transform: LayerTransform }
export interface ShaderLayer extends BaseShaderLayer { transform: LayerTransform }
export type Layer = SolidLayer | ImageLayer | TextLayer | ShaderLayer

// ── Reactions ─────────────────────────────────────────────────────────────────

export type ReactionTrigger =
  | { kind: 'detection'; moduleId: string }

export type ReactionAction =
  | { kind: 'shader:setUniform'; layerId: string; uniform: string; value: number }
  | { kind: 'layer:opacity'; layerId: string; value: number }

export interface Reaction {
  id: string
  name: string
  trigger: ReactionTrigger
  action: ReactionAction
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Calibration {} // populated by M6 (camera-to-projector mapping)

export interface VolumeShape extends BaseVolumeShape {
  layers: Layer[]
  reactions: Reaction[]
}

export interface Volume extends Omit<BaseVolume, 'shapes'> {
  shapes: VolumeShape[]
}

export interface Surface extends Omit<BaseSurface, 'layers'> {
  areaOfInterest?: Polygon
  layers: Layer[]
  reactions: Reaction[]
}

export interface Slide {
  id: string
  name: string
  surfaces: Surface[]
  graphConfig: GraphConfig
  volume?: Volume
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

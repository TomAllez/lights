export interface Vec3 { x: number; y: number; z: number }

export type VolumeShapeType = 'box' | 'sphere' | 'cylinder' | 'cone' | 'grid'

export type VolumeEditMode = 'object' | 'vertex' | 'edge' | 'face'

export interface VolumeCamera {
  position: Vec3
  target: Vec3
  fov: number
}

export interface VolumeShape {
  id: string
  name: string
  type: VolumeShapeType
  position: Vec3
  rotation: Vec3  // Euler XYZ degrees
  scale: Vec3
  vertices?: number[] // Optional custom vertex offsets [x0, y0, z0, x1, y1, z1, ...]
  indices?: number[]  // Optional custom indices for non-primitive topology
}

export interface Volume {
  id: string
  name: string
  camera: VolumeCamera
  shapes: VolumeShape[]
}

export interface Point { x: number; y: number }

export interface LayerTransform {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface SolidLayer { id: string; type: 'solid'; name: string; visible: boolean; color: string; transform: LayerTransform }
export interface ImageLayer { id: string; type: 'image'; name: string; visible: boolean; src: string; transform: LayerTransform }
export interface TextLayer { id: string; type: 'text'; name: string; visible: boolean; content: string; fontSize: number; color: string; transform: LayerTransform }

export type ShaderPreset = 'pulse' | 'ripple' | 'chromatic'
export interface ShaderLayer { id: string; type: 'shader'; name: string; visible: boolean; preset: ShaderPreset; uniforms: Record<string, number>; transform: LayerTransform }

export type Layer = SolidLayer | ImageLayer | TextLayer | ShaderLayer

export interface Surface {
  id: string
  name: string
  outputPolygon: [Point, Point, Point, Point]
  layers: Layer[]
}

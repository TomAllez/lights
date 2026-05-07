import type { Point } from './types'

export interface Landmark3D { x: number; y: number; z: number }

export interface HandposeEvent {
  kind: 'handpose'
  moduleId: string
  handedness: 'Left' | 'Right'
  landmarks: Landmark3D[]
  position: Point
}

export interface FacemeshEvent {
  kind: 'facemesh'
  moduleId: string
  landmarks: Landmark3D[]
  position: Point
}

export type TypedDetectionEvent = HandposeEvent | FacemeshEvent

export function decodeTypedDetection(
  moduleId: string,
  position: Point,
  data: ArrayBuffer,
): TypedDetectionEvent | null {
  if (moduleId.startsWith('handpose:') && data.byteLength >= 1 + 21 * 12) {
    const view = new DataView(data)
    const handedness = new Uint8Array(data)[0] === 1 ? 'Right' as const : 'Left' as const
    const landmarks: Landmark3D[] = []
    for (let i = 0; i < 21; i++) {
      const off = 1 + i * 12
      landmarks.push({
        x: view.getFloat32(off,     true),
        y: view.getFloat32(off + 4, true),
        z: view.getFloat32(off + 8, true),
      })
    }
    return { kind: 'handpose', moduleId, handedness, landmarks, position }
  }
  if (moduleId === 'facemesh' && data.byteLength >= 468 * 12) {
    const view = new DataView(data)
    const landmarks: Landmark3D[] = []
    for (let i = 0; i < 468; i++) {
      const off = i * 12
      landmarks.push({
        x: view.getFloat32(off,     true),
        y: view.getFloat32(off + 4, true),
        z: view.getFloat32(off + 8, true),
      })
    }
    return { kind: 'facemesh', moduleId, landmarks, position }
  }
  return null
}

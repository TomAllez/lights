import * as THREE from 'three'
import type { VolumeShape } from '../model/types'

export function buildShapeMesh(shape: VolumeShape): THREE.Mesh {
  let geo: THREE.BufferGeometry
  switch (shape.type) {
    case 'box':      geo = new THREE.BoxGeometry(); break
    case 'sphere':   geo = new THREE.SphereGeometry(0.5, 32, 16); break
    case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break
    case 'cone':     geo = new THREE.ConeGeometry(0.5, 1, 32); break
  }
  const mat = new THREE.MeshNormalMaterial()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(shape.position.x, shape.position.y, shape.position.z)
  mesh.rotation.set(
    shape.rotation.x * Math.PI / 180,
    shape.rotation.y * Math.PI / 180,
    shape.rotation.z * Math.PI / 180,
  )
  mesh.scale.set(shape.scale.x, shape.scale.y, shape.scale.z)
  return mesh
}

export function disposeShapeMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
}

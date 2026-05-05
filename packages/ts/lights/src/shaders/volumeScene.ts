import * as THREE from 'three'
import type { VolumeShape } from '../model/types'

function buildCalibrationGridMaterial(): THREE.MeshBasicMaterial {
  const px = 512
  const divs = 8
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, px, px)

  const step = px / divs
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1
  for (let i = 0; i <= divs; i++) {
    const v = i * step
    ctx.beginPath(); ctx.moveTo(v, 0);  ctx.lineTo(v, px); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, v);  ctx.lineTo(px, v); ctx.stroke()
  }

  // Thicker border
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, px - 3, px - 3)

  // Center crosshair
  const cx = px / 2, cy = px / 2, arm = 28
  ctx.strokeStyle = 'rgba(255,80,80,0.95)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm); ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke()

  const tex = new THREE.CanvasTexture(canvas)
  return new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
}

export function buildShapeMesh(shape: VolumeShape): THREE.Mesh {
  let geo: THREE.BufferGeometry
  let mat: THREE.Material

  if (shape.type === 'grid') {
    geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2) // lie flat on XZ plane by default
    mat = buildCalibrationGridMaterial()
  } else {
    switch (shape.type) {
      case 'box':      geo = new THREE.BoxGeometry(); break
      case 'sphere':   geo = new THREE.SphereGeometry(0.5, 32, 16); break
      case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break
      case 'cone':     geo = new THREE.ConeGeometry(0.5, 1, 32); break
    }
    mat = new THREE.MeshNormalMaterial()
  }

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
  const mat = mesh.material as THREE.MeshBasicMaterial
  mat.map?.dispose()
  mat.dispose()
}

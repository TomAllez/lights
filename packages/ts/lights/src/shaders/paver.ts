import * as THREE from 'three'
import { solvePaverCamera } from '../model/paver'
import type { Paver } from '../model/types'

const checkerFrag = /* glsl */`
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  float c = mod(floor(vUv.x * 6.0) + floor(vUv.y * 6.0), 2.0);
  gl_FragColor = vec4(mix(uColor * 0.55, uColor, c), 0.8);
}
`

const checkerVert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const CHECKER_COLORS: [number, number, number][] = [
  [0.38, 0.65, 0.98],
  [0.37, 0.80, 0.60],
  [0.98, 0.60, 0.38],
  [0.80, 0.37, 0.74],
  [0.98, 0.85, 0.37],
]

let colorIndex = 0

function checkerMaterial(colorIdx: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: checkerVert,
    fragmentShader: checkerFrag,
    uniforms: { uColor: { value: new THREE.Vector3(...CHECKER_COLORS[colorIdx % CHECKER_COLORS.length]) } },
    transparent: true,
    side: THREE.FrontSide,
    depthTest: true,
  })
}

// ── Per-paver render state ────────────────────────────────────────────────────

export interface PaverRenderState {
  scene: THREE.Scene
  target: THREE.WebGLRenderTarget
  colorIdx: number
  dispose: () => void
}

export function buildPaverRenderState(paver: Paver, stageW: number, stageH: number): PaverRenderState {
  const scene = new THREE.Scene()
  const colorIdx = colorIndex++

  if (paver.cubes.length === 0) {
    // Show checkerboard on bounding box faces when no cubes placed
    const { width: w, height: h, depth: d } = paver.dimensions
    const geo = new THREE.BoxGeometry(w, h, d)
    const mat = checkerMaterial(colorIdx)
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)
  } else {
    const mat = checkerMaterial(colorIdx)
    for (const cube of paver.cubes) {
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(...cube.position)
      scene.add(mesh)
    }
  }

  const target = new THREE.WebGLRenderTarget(stageW, stageH, {
    format: THREE.RGBAFormat,
    depthBuffer: true,
  })

  return {
    scene,
    target,
    colorIdx,
    dispose() {
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material.dispose()
        }
      })
      target.dispose()
    },
  }
}

export function renderPaver(
  paver: Paver,
  state: PaverRenderState,
  renderer: THREE.WebGLRenderer,
): void {
  const cam = solvePaverCamera(paver.dimensions, paver.stageCorners)
  const prev = renderer.getRenderTarget()
  renderer.setRenderTarget(state.target)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(state.scene, cam)
  renderer.setRenderTarget(prev)
}

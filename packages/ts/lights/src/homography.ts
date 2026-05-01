import * as THREE from 'three'
import type { SolidLayer, Surface } from './model/types'

// ── Shaders ──────────────────────────────────────────────────────────────────

const vertexShader = /* glsl */`
attribute float aW;
varying vec2 vUv;
void main() {
  vUv = uv;
  // position is pre-multiplied by W; setting gl_Position.w = aW causes the GPU
  // to perspective-divide back to the correct NDC coords and to interpolate vUv
  // perspective-correctly across the quad (the "W trick").
  gl_Position = vec4(position.xy, 0.0, aW);
}
`

const fragmentShaderChecker = /* glsl */`
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  float check = mod(floor(vUv.x * 6.0) + floor(vUv.y * 6.0), 2.0);
  vec3 col = mix(uColor * 0.55, uColor, check);
  gl_FragColor = vec4(col, 0.8);
}
`

const fragmentShaderSolid = /* glsl */`
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`

function hexToVec3(hex: string): THREE.Vector3 {
  const n = parseInt(hex.replace('#', ''), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// ── Math ─────────────────────────────────────────────────────────────────────

function gaussianElim(A: number[][], b: number[]): number[] {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row
    }
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col]
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

// 3×3 homography (row-major, h22=1) mapping src[i] → dst[i] via DLT.
function computeHomography(src: [number, number][], dst: [number, number][]): number[] {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i]
    const [x, y] = dst[i]
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v])
    b.push(x)
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v])
    b.push(y)
  }
  return [...gaussianElim(A, b), 1]
}

// ── Mesh builder ─────────────────────────────────────────────────────────────

// UV corners matching outputPolygon corner order: TL, TR, BR, BL
const SRC_UVS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]

const COLORS: [number, number, number][] = [
  [0.38, 0.65, 0.98],
  [0.37, 0.80, 0.60],
  [0.98, 0.60, 0.38],
  [0.80, 0.37, 0.74],
  [0.98, 0.85, 0.37],
]

export function buildSurfaceMesh(surface: Surface, colorIdx: number): THREE.Mesh {
  // Convert normalized stage [0,1] coords to NDC [-1,1]; flip Y (stage Y↓, NDC Y↑)
  const dst: [number, number][] = surface.outputPolygon.map(p => [
    p.x * 2 - 1,
    1 - p.y * 2,
  ])

  const H = computeHomography(SRC_UVS, dst)

  const positions = new Float32Array(12)
  const uvs = new Float32Array(8)
  const ws = new Float32Array(4)

  SRC_UVS.forEach(([u, v], i) => {
    const w = H[6] * u + H[7] * v + H[8]
    positions[i * 3]     = dst[i][0] * w
    positions[i * 3 + 1] = dst[i][1] * w
    positions[i * 3 + 2] = 0
    uvs[i * 2]     = u
    uvs[i * 2 + 1] = v
    ws[i] = w
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('aW',       new THREE.BufferAttribute(ws, 1))
  geo.setIndex([0, 1, 2, 0, 2, 3])

  const solidLayer = surface.layers.find((l): l is SolidLayer => l.type === 'solid' && l.visible)
  const material = solidLayer
    ? new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: fragmentShaderSolid,
        uniforms: { uColor: { value: hexToVec3(solidLayer.color) } },
        transparent: false,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    : new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: fragmentShaderChecker,
        uniforms: { uColor: { value: new THREE.Vector3(...COLORS[colorIdx % COLORS.length]) } },
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
      })

  return new THREE.Mesh(geo, material)
}

export function disposeSurfaceMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
}

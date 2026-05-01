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

// Flip V to compensate for Three.js's default flipY on canvas textures
const fragmentShaderTexture = /* glsl */`
varying vec2 vUv;
uniform sampler2D uTexture;
void main() {
  gl_FragColor = texture2D(uTexture, vec2(vUv.x, 1.0 - vUv.y));
}
`

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

// ── Texture compositor ────────────────────────────────────────────────────────

// Composite all visible layers onto an offscreen canvas (surface local space,
// Y-down), then wrap it in a Three.js CanvasTexture. Returns null if no layers.
const TEX_SIZE = 512

function buildSurfaceTexture(surface: Surface): THREE.CanvasTexture | null {
  const visibleLayers = surface.layers.filter(l => l.visible)
  if (visibleLayers.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width  = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')!

  // Render bottom-to-top: surface.layers[0] is the top layer in the panel,
  // so we iterate in reverse to draw the backmost layer first.
  for (const layer of [...surface.layers].reverse()) {
    if (!layer.visible || layer.type !== 'solid') continue
    const l = layer as SolidLayer
    const t = l.transform
    ctx.save()
    ctx.translate(t.x * TEX_SIZE, t.y * TEX_SIZE)
    ctx.rotate(t.rotation * Math.PI / 180)
    ctx.fillStyle = l.color
    ctx.fillRect(-t.w * TEX_SIZE / 2, -t.h * TEX_SIZE / 2, t.w * TEX_SIZE, t.h * TEX_SIZE)
    ctx.restore()
  }

  return new THREE.CanvasTexture(canvas)
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

  const texture = buildSurfaceTexture(surface)
  const material = texture
    ? new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: fragmentShaderTexture,
        uniforms: { uTexture: { value: texture } },
        transparent: true,
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
  const mat = mesh.material as THREE.ShaderMaterial
  ;(mat.uniforms.uTexture?.value as THREE.Texture | undefined)?.dispose()
  mat.dispose()
}

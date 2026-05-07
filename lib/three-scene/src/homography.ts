import * as THREE from 'three'
import type { ImageLayer, SolidLayer, Surface, TextLayer, Layer, Point, LayerTransform } from './types'

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

// ── Image cache ───────────────────────────────────────────────────────────────

/** Module-level cache keyed by src (data URL). Survives across mesh rebuilds. */
const imgCache = new Map<string, HTMLImageElement>()

function loadImg(src: string): Promise<HTMLImageElement | null> {
  if (imgCache.has(src)) return Promise.resolve(imgCache.get(src)!)
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => { imgCache.set(src, img); resolve(img) }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/**
 * Pre-load all image-layer assets referenced by the given surfaces into the
 * module cache so that `buildSurfaceMesh` / `buildSurfaceTexture` can run
 * synchronously. Call this before rebuilding meshes whenever surfaces change.
 */
export async function preloadSurfaces(surfaces: Surface[]): Promise<void> {
  const srcs: string[] = []
  for (const s of surfaces) {
    for (const l of s.layers) {
      if (l.type === 'image' && l.visible) srcs.push((l as ImageLayer).src)
    }
  }
  await Promise.all(srcs.map(loadImg))
}

// ── Layer drawing ─────────────────────────────────────────────────────────────

const TEX_SIZE = 512

function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  layer: SolidLayer | ImageLayer | TextLayer,
): void {
  const t = layer.transform
  ctx.save()
  ctx.translate(t.x * TEX_SIZE, t.y * TEX_SIZE)
  ctx.rotate(t.rotation * Math.PI / 180)

  if (layer.type === 'solid') {
    ctx.fillStyle = layer.color
    ctx.fillRect(-t.w * TEX_SIZE / 2, -t.h * TEX_SIZE / 2, t.w * TEX_SIZE, t.h * TEX_SIZE)
  } else if (layer.type === 'image') {
    const img = imgCache.get(layer.src)
    if (img) ctx.drawImage(img, -t.w * TEX_SIZE / 2, -t.h * TEX_SIZE / 2, t.w * TEX_SIZE, t.h * TEX_SIZE)
  } else if (layer.type === 'text') {
    const scaledSize = layer.fontSize * TEX_SIZE / 500
    ctx.font = `${scaledSize}px sans-serif`
    ctx.fillStyle = layer.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const boxW = t.w * TEX_SIZE
    const lines = layer.content.split('\n')
    const lineH = scaledSize * 1.2
    const totalH = lines.length * lineH
    lines.forEach((line, i) => {
      const y = -totalH / 2 + i * lineH + lineH / 2
      ctx.fillText(line, 0, y, boxW)
    })
  }

  ctx.restore()
}

// ── Texture compositor ────────────────────────────────────────────────────────

// Composite all visible static layers onto an offscreen canvas (surface local
// space, Y-down), then wrap it in a Three.js CanvasTexture. Returns null if no
// visible static layers. Detection canvas layers are skipped here — they are
// handled by buildLiveSurfaceMesh.
function buildSurfaceTexture(surface: Surface): THREE.CanvasTexture | null {
  const visibleStatic = surface.layers.filter(
    (l: Layer) => l.visible && l.type !== 'detectionCanvas',
  )
  if (visibleStatic.length === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width  = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')!

  for (const layer of [...surface.layers].reverse()) {
    if (!layer.visible || layer.type === 'detectionCanvas') continue
    drawStaticLayer(ctx, layer as SolidLayer | ImageLayer | TextLayer)
  }

  return new THREE.CanvasTexture(canvas)
}

// ── Geometry builder ──────────────────────────────────────────────────────────

// UV corners matching outputPolygon corner order: TL, TR, BR, BL
const SRC_UVS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]

function buildSurfaceGeometry(surface: Surface): THREE.BufferGeometry {
  const dst: [number, number][] = surface.outputPolygon.map((p: Point) => [
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
  return geo
}

// ── Public types for live surfaces ────────────────────────────────────────────

/**
 * Callback invoked by the compositor for each visible detectionCanvas layer.
 * Implement this in the app layer to forward the call to the appropriate
 * DetectionCanvasRenderer instance.
 */
export type DrawDetectionLayer = (
  ctx: CanvasRenderingContext2D,
  layerId: string,
  transform: LayerTransform,
  w: number,
  h: number,
  dt: number,
) => void

/** Handle returned by buildLiveSurfaceMesh for surfaces with detection canvas layers. */
export interface LiveSurfaceMesh {
  mesh: THREE.Mesh
  /** Recomposite all layers (static + detection) and mark the texture dirty. */
  recomposite(dt: number): void
}

// ── Mesh builders ─────────────────────────────────────────────────────────────

const COLORS: [number, number, number][] = [
  [0.38, 0.65, 0.98],
  [0.37, 0.80, 0.60],
  [0.98, 0.60, 0.38],
  [0.80, 0.37, 0.74],
  [0.98, 0.85, 0.37],
]

/** Build a static surface mesh. Use for surfaces with no detectionCanvas layers. */
export function buildSurfaceMesh(surface: Surface, colorIdx: number): THREE.Mesh {
  const geo = buildSurfaceGeometry(surface)
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

/**
 * Build a live surface mesh for surfaces that contain detectionCanvas layers.
 * All layers (static + detection) are composited into one CanvasTexture each
 * time `recomposite` is called, then reprojected by the same homography shader.
 */
export function buildLiveSurfaceMesh(
  surface: Surface,
  colorIdx: number,
  drawDetectionLayer: DrawDetectionLayer,
): LiveSurfaceMesh {
  const geo = buildSurfaceGeometry(surface)

  const canvas = document.createElement('canvas')
  canvas.width  = TEX_SIZE
  canvas.height = TEX_SIZE
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: fragmentShaderTexture,
    uniforms: { uTexture: { value: texture } },
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  })

  const mesh = new THREE.Mesh(geo, material)

  // Keep a fallback checker color for when the canvas is still empty.
  void COLORS[colorIdx % COLORS.length]

  function recomposite(dt: number): void {
    ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE)
    for (const layer of [...surface.layers].reverse()) {
      if (!layer.visible) continue
      if (layer.type === 'detectionCanvas') {
        drawDetectionLayer(ctx, layer.id, layer.transform, TEX_SIZE, TEX_SIZE, dt)
      } else {
        drawStaticLayer(ctx, layer as SolidLayer | ImageLayer | TextLayer)
      }
    }
    texture.needsUpdate = true
  }

  recomposite(0)

  return { mesh, recomposite }
}

export function disposeSurfaceMesh(mesh: THREE.Mesh): void {
  mesh.geometry.dispose()
  const mat = mesh.material as THREE.ShaderMaterial
  ;(mat.uniforms.uTexture?.value as THREE.Texture | undefined)?.dispose()
  mat.dispose()
}

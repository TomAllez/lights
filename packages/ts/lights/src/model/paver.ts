import * as THREE from 'three'
import type { PaverCorners, PaverDimensions } from './types'

// ── Linear algebra helpers ───────────────────────────────────────────────────

function dot3(a: number[], b: number[]) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
function sub3(a: number[], b: number[]): number[] { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]] }
function scale3(a: number[], s: number): number[] { return [a[0]*s, a[1]*s, a[2]*s] }
function norm3(a: number[]) { return Math.sqrt(dot3(a, a)) }
function normalize3(a: number[]): number[] { const n = norm3(a); return n > 1e-12 ? scale3(a, 1/n) : [0,0,0] }

function mat3Transpose(M: number[][]): number[][] {
  return [[M[0][0],M[1][0],M[2][0]], [M[0][1],M[1][1],M[2][1]], [M[0][2],M[1][2],M[2][2]]]
}

function mat3Mul(A: number[][], B: number[][]): number[][] {
  return Array.from({length: 3}, (_, i) =>
    Array.from({length: 3}, (_, j) => A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j])
  )
}

function mat3Inv(M: number[][]): number[][] {
  const d = M[0][0]*(M[1][1]*M[2][2]-M[1][2]*M[2][1])
           -M[0][1]*(M[1][0]*M[2][2]-M[1][2]*M[2][0])
           +M[0][2]*(M[1][0]*M[2][1]-M[1][1]*M[2][0])
  return [
    [(M[1][1]*M[2][2]-M[1][2]*M[2][1])/d, -(M[0][1]*M[2][2]-M[0][2]*M[2][1])/d,  (M[0][1]*M[1][2]-M[0][2]*M[1][1])/d],
    [-(M[1][0]*M[2][2]-M[1][2]*M[2][0])/d, (M[0][0]*M[2][2]-M[0][2]*M[2][0])/d, -(M[0][0]*M[1][2]-M[0][2]*M[1][0])/d],
    [(M[1][0]*M[2][1]-M[1][1]*M[2][0])/d, -(M[0][0]*M[2][1]-M[0][1]*M[2][0])/d,  (M[0][0]*M[1][1]-M[0][1]*M[1][0])/d],
  ]
}

// Gaussian elimination (same as homography.ts)
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

// Overdetermined least squares: (A^T A) x = A^T b
function leastSquares(A: number[][], b: number[]): number[] {
  const m = A.length, n = A[0].length
  const ATA: number[][] = Array.from({length: n}, (_, i) =>
    Array.from({length: n}, (_, j) => A.reduce((s, row) => s + row[i]*row[j], 0))
  )
  const ATb: number[] = Array.from({length: n}, (_, i) =>
    A.reduce((s, row, k) => s + row[i]*b[k], 0)
  )
  return gaussianElim(ATA, ATb)
}

// QR decomposition via Gram-Schmidt; columns of M are the input vectors
function qrDecomp(cols: number[][]): { Q: number[][], R: number[][] } {
  const n = cols.length
  const es: number[][] = []
  for (let i = 0; i < n; i++) {
    let u = [...cols[i]]
    for (let j = 0; j < i; j++) u = sub3(u, scale3(es[j], dot3(cols[i], es[j])))
    es.push(normalize3(u))
  }
  const Q = [[es[0][0],es[1][0],es[2][0]], [es[0][1],es[1][1],es[2][1]], [es[0][2],es[1][2],es[2][2]]]
  const A = [[cols[0][0],cols[1][0],cols[2][0]], [cols[0][1],cols[1][1],cols[2][1]], [cols[0][2],cols[1][2],cols[2][2]]]
  const R = mat3Mul(mat3Transpose(Q), A)
  return { Q, R }
}

// RQ decomposition: M = K * Rrot (K upper-triangular, Rrot orthogonal)
// Via QR of M^{-1}: M^{-1} = Q * Rinv => M = Rinv^{-1} * Q^T = K * Rrot
function rqDecomp(M: number[][]): { K: number[][], Rrot: number[][] } {
  const Minv = mat3Inv(M)
  const cols = [[Minv[0][0],Minv[1][0],Minv[2][0]], [Minv[0][1],Minv[1][1],Minv[2][1]], [Minv[0][2],Minv[1][2],Minv[2][2]]]
  const { Q, R: Rinv } = qrDecomp(cols)

  // Enforce positive diagonal so K intrinsics are conventional (fx, fy > 0)
  for (let i = 0; i < 3; i++) {
    if (Rinv[i][i] < 0) {
      Rinv[i] = Rinv[i].map(x => -x)
      for (let j = 0; j < 3; j++) Q[j][i] = -Q[j][i]
    }
  }

  return { K: mat3Inv(Rinv), Rrot: mat3Transpose(Q) }
}

// ── DLT PnP solve ────────────────────────────────────────────────────────────

// Solve for 3×4 projection matrix P from ≥6 2D↔3D correspondences.
// pts3d in physical units, pts2d in normalised stage [0,1].
function dltSolve(pts3d: [number,number,number][], pts2d: [number,number][]): number[][] {
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < pts3d.length; i++) {
    const [X, Y, Z] = pts3d[i]
    const [x, y] = pts2d[i]
    A.push([X, Y, Z, 1, 0, 0, 0, 0, -x*X, -x*Y, -x*Z])
    b.push(x)
    A.push([0, 0, 0, 0, X, Y, Z, 1, -y*X, -y*Y, -y*Z])
    b.push(y)
  }
  const p = leastSquares(A, b)
  return [
    [p[0], p[1], p[2],  p[3]],
    [p[4], p[5], p[6],  p[7]],
    [p[8], p[9], p[10], 1   ],
  ]
}

// ── Camera from P ────────────────────────────────────────────────────────────

// Build a calibrated Three.js camera from a 3×4 DLT matrix.
// Uses RQ decomposition: P = K * [R | t]
export function cameraFromP(P: number[][], near = 0.01, far = 1000): THREE.PerspectiveCamera {
  const M = [P[0].slice(0,3), P[1].slice(0,3), P[2].slice(0,3)]
  const p4 = [P[0][3], P[1][3], P[2][3]]

  const { K, Rrot } = rqDecomp(M)

  // Normalise K so K[2][2] = 1
  const s = K[2][2]
  const Kn = K.map(row => row.map(x => x/s))
  const t = mat3Inv(Kn).map(row => row[0]*p4[0] + row[1]*p4[1] + row[2]*p4[2])

  const fx = Kn[0][0], fy = Math.abs(Kn[1][1])  // fy may be negative (Y-flip)
  const cx = Kn[0][2], cy = Kn[1][2]

  // OpenGL projection for normalised [0,1] image coords.
  // Camera convention here: +z into scene, Y-down image.
  // Three.js expects camera looking along -z, so we flip z via the view matrix.
  const proj = new THREE.Matrix4()
  proj.set(
     2*fx,     0,  -(2*cx - 1),              0,
        0, -2*fy,   (2*cy - 1),              0,
        0,     0, -(far+near)/(far-near), -2*far*near/(far-near),
        0,     0,  -1,                        0,
  )

  // View matrix: apply z-flip so Three.js camera looks along -z while our
  // convention has +z depth. That means negating row 2 of [R | t].
  const view = new THREE.Matrix4()
  view.set(
     Rrot[0][0],  Rrot[0][1],  Rrot[0][2], t[0],
     Rrot[1][0],  Rrot[1][1],  Rrot[1][2], t[1],
    -Rrot[2][0], -Rrot[2][1], -Rrot[2][2], -t[2],
    0, 0, 0, 1,
  )

  const cam = new THREE.PerspectiveCamera()
  cam.matrixAutoUpdate = false
  cam.projectionMatrix.copy(proj)
  cam.projectionMatrixInverse.copy(proj).invert()
  cam.matrixWorldInverse.copy(view)
  cam.matrixWorld.copy(view).invert()
  return cam
}

// ── Bounding box corners ─────────────────────────────────────────────────────

// Returns the 8 3D bounding box corners in the paver's local space.
// Layout: 0-3 = front face (z=-d/2) TL→TR→BR→BL, 4-7 = back face (z=+d/2)
export function paverCorners3d(dim: PaverDimensions): [number,number,number][] {
  const { width: w, height: h, depth: d } = dim
  const hw = w/2, hh = h/2, hd = d/2
  return [
    [-hw,  hh, -hd], [ hw,  hh, -hd], [ hw, -hh, -hd], [-hw, -hh, -hd],
    [-hw,  hh,  hd], [ hw,  hh,  hd], [ hw, -hh,  hd], [-hw, -hh,  hd],
  ] as [number,number,number][]
}

// ── Default stage corners ─────────────────────────────────────────────────────

// Project the bounding box corners through a canonical front-facing camera.
// The paver is centered on stage at a sensible scale.
export function defaultPaverCorners(dim: PaverDimensions, stageAspect = 16/9): PaverCorners {
  const { width: w, height: h, depth: d } = dim

  // Canonical camera: positioned in front of paver along -z, looking along +z.
  // Vertical FOV 60° → fy_norm = 1/(2·tan30°) ≈ 0.866 (but negative for Y-down stage)
  const fy = -1 / (2 * Math.tan(Math.PI / 6))        // ≈ -0.866
  const fx = fy / stageAspect                          // narrower per unit in x
  const cx = 0.5, cy = 0.5

  // Camera far enough that front face spans ~60 % of stage height
  const zOffset = Math.abs(fy) * h / 0.6

  // Camera at (0, 0, -(d/2 + zOffset)), R = I, t = (0, 0, d/2 + zOffset)
  const camZ = d/2 + zOffset

  const pts3d = paverCorners3d(dim)
  const projected = pts3d.map(([X, Y, Z]) => {
    const Zc = Z + camZ   // camera space Z (depth)
    const x = fx * X / Zc + cx
    const y = fy * Y / Zc + cy
    return { x, y }
  })

  return projected as unknown as PaverCorners
}

// ── Solve camera for a paver ─────────────────────────────────────────────────

export function solvePaverCamera(
  dim: PaverDimensions,
  stageCorners: PaverCorners,
  near = 0.01,
  far = 1000,
): THREE.PerspectiveCamera {
  const pts3d = paverCorners3d(dim) as [number,number,number][]
  const pts2d = stageCorners.map(p => [p.x, p.y]) as [number,number][]
  const P = dltSolve(pts3d, pts2d)
  return cameraFromP(P, near, far)
}

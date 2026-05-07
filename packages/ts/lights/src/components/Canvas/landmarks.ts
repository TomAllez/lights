// ── MediaPipe topology ────────────────────────────────────────────────────────

/** Index pairs defining the hand skeleton connectivity (MediaPipe 21-point model). */
export const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]

/** Grouped face-mesh features — each entry carries its own stroke style and connections. */
export const FACE_FEATURES = [
  {
    color: 'rgba(255,255,255,0.5)', lineWidth: 1,
    connections: [
      [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],
      [356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],
      [379,380],[380,381],[381,382],[382,362],
      [10,109],[109,67],[67,103],[103,54],[54,21],[21,162],[162,127],[127,234],
      [234,93],[93,132],[132,58],[58,172],[172,136],[136,150],[150,149],
      [149,176],[176,148],[148,152],[152,377],[377,400],[400,378],[378,379],
    ],
  },
  {
    color: '#00e5ff', lineWidth: 1.5,
    connections: [
      [263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],
      [263,466],[466,388],[388,387],[387,386],[386,385],[385,384],[384,398],[398,362],
    ],
  },
  {
    color: '#00e5ff', lineWidth: 1.5,
    connections: [
      [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],
      [33,246],[246,161],[161,160],[160,159],[159,158],[158,157],[157,173],[173,133],
    ],
  },
  {
    color: '#ffea00', lineWidth: 1.5,
    connections: [
      [276,283],[283,282],[282,295],[295,285],
      [300,293],[293,334],[334,296],[296,336],
    ],
  },
  {
    color: '#ffea00', lineWidth: 1.5,
    connections: [
      [46,53],[53,52],[52,65],[65,55],
      [70,63],[63,105],[105,66],[66,107],
    ],
  },
  {
    color: '#ff4081', lineWidth: 1.5,
    connections: [
      [61,146],[146,91],[91,181],[181,84],[84,17],[17,314],[314,405],[405,321],
      [321,375],[375,291],[61,185],[185,40],[40,39],[39,37],[37,0],[0,267],
      [267,269],[269,270],[270,409],[409,291],
      [78,95],[95,88],[88,178],[178,87],[87,14],[14,317],[317,402],[402,318],
      [318,324],[324,308],[78,191],[191,80],[80,81],[81,82],[82,13],[13,312],
      [312,311],[311,310],[310,415],[415,308],
    ],
  },
  {
    color: '#ff9800', lineWidth: 1,
    connections: [
      [168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,19],[19,94],[94,2],
      [2,164],[164,0],
    ],
  },
]

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single MediaPipe landmark in normalized [0,1] space with a depth hint. */
export interface Landmark { x: number; y: number; z: number }

/** Decoded hand-pose frame: handedness classification + 21 landmarks. */
export interface Hand { handedness: 'Left' | 'Right'; landmarks: Landmark[] }

/** Screen-space rect used to map normalized landmark coordinates onto the canvas. */
export interface Rect { x: number; y: number; w: number; h: number }

// ── Decode ────────────────────────────────────────────────────────────────────

/**
 * Decode a binary hand-pose buffer arriving over the IPC transport.
 * Layout: byte 0 = handedness (1 = Right), then 21 × 3 × float32 landmarks.
 */
export function decodeHandpose(data: ArrayBuffer): Hand {
  const view = new DataView(data)
  const handedness = new Uint8Array(data)[0] === 1 ? 'Right' as const : 'Left' as const
  const landmarks: Landmark[] = []
  for (let i = 0; i < 21; i++) {
    const off = 1 + i * 12
    landmarks.push({
      x: view.getFloat32(off,     true),
      y: view.getFloat32(off + 4, true),
      z: view.getFloat32(off + 8, true),
    })
  }
  return { handedness, landmarks }
}

/**
 * Decode a binary face-mesh buffer arriving over the IPC transport.
 * Layout: 468 × 3 × float32 landmarks (no header byte).
 */
export function decodeFacemesh(data: ArrayBuffer): Landmark[] {
  const view = new DataView(data)
  const landmarks: Landmark[] = []
  for (let i = 0; i < 468; i++) {
    const off = i * 12
    landmarks.push({
      x: view.getFloat32(off,     true),
      y: view.getFloat32(off + 4, true),
      z: view.getFloat32(off + 8, true),
    })
  }
  return landmarks
}

// ── Draw ──────────────────────────────────────────────────────────────────────

/**
 * Compute a letterbox/pillarbox rect so a frame of size (fw × fh) fits
 * inside a canvas of size (cw × ch) while preserving aspect ratio.
 */
export function frameRect(cw: number, ch: number, fw: number, fh: number): Rect {
  const wa = cw / ch
  const fa = fw / fh
  if (wa > fa) {
    const w = ch * fa
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }
  const h = cw / fa
  return { x: 0, y: (ch - h) / 2, w: cw, h }
}

/** Draw all hand skeletons onto the 2D landmark overlay canvas. */
export function drawHands(ctx: CanvasRenderingContext2D, hands: Hand[], r: Rect): void {
  for (const { handedness, landmarks } of hands) {
    const color = handedness === 'Right' ? '#00e676' : '#40c4ff'
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    for (const [a, b] of HAND_CONNECTIONS) {
      const la = landmarks[a], lb = landmarks[b]
      ctx.beginPath()
      ctx.moveTo(r.x + la.x * r.w, r.y + la.y * r.h)
      ctx.lineTo(r.x + lb.x * r.w, r.y + lb.y * r.h)
      ctx.stroke()
    }
    ctx.fillStyle = color
    for (const lm of landmarks) {
      ctx.beginPath()
      ctx.arc(r.x + lm.x * r.w, r.y + lm.y * r.h, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Draw all face-mesh overlays onto the 2D landmark overlay canvas. */
export function drawFaces(ctx: CanvasRenderingContext2D, faces: Landmark[][], r: Rect): void {
  for (const landmarks of faces) {
    for (const { connections, color, lineWidth } of FACE_FEATURES) {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      for (const [a, b] of connections) {
        const la = landmarks[a], lb = landmarks[b]
        ctx.beginPath()
        ctx.moveTo(r.x + la.x * r.w, r.y + la.y * r.h)
        ctx.lineTo(r.x + lb.x * r.w, r.y + lb.y * r.h)
        ctx.stroke()
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    for (const lm of landmarks) {
      const radius = Math.max(0.8, 2 - lm.z * 4)
      ctx.beginPath()
      ctx.arc(r.x + lm.x * r.w, r.y + lm.y * r.h, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// ── MediaPipe topology ───────────────────────────────────────────────────────

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
]

const FACE_FEATURES = [
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

// ── Types ────────────────────────────────────────────────────────────────────

interface Landmark { x: number; y: number; z: number }
interface Hand { handedness: 'Left' | 'Right'; landmarks: Landmark[] }
interface Rect { x: number; y: number; w: number; h: number }

// ── Decode ───────────────────────────────────────────────────────────────────

function decodeHandpose(data: ArrayBuffer): Hand {
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

function decodeFacemesh(data: ArrayBuffer): Landmark[] {
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

// ── Draw ─────────────────────────────────────────────────────────────────────

function frameRect(cw: number, ch: number, fw: number, fh: number): Rect {
  const wa = cw / ch
  const fa = fw / fh
  if (wa > fa) {
    const w = ch * fa
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }
  const h = cw / fa
  return { x: 0, y: (ch - h) / 2, w: cw, h }
}

function drawHands(ctx: CanvasRenderingContext2D, hands: Hand[], r: Rect) {
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

function drawFaces(ctx: CanvasRenderingContext2D, faces: Landmark[][], r: Rect) {
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

// ── Component ────────────────────────────────────────────────────────────────

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current!

    // WebGL renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    // 2D overlay for landmarks — appended after WebGL canvas so it sits on top
    const overlay = document.createElement('canvas')
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    container.appendChild(overlay)
    const ctx = overlay.getContext('2d')!

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    let frameW = 1
    let frameH = 1
    let frameBuffer = new Uint8Array(4)
    let texture = new THREE.DataTexture(frameBuffer, 1, 1)

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Detections accumulate between frames, flushed on each frame event
    let pendingHands: Hand[] = []
    let pendingFaces: Landmark[][] = []

    function updateLayout() {
      const { clientWidth: w, clientHeight: h } = container
      const fa = frameW / frameH
      const wa = w / h
      mesh.scale.set(wa > fa ? fa / wa : 1, wa > fa ? 1 : wa / fa, 1)
      renderer.setSize(w, h)
      overlay.width = w
      overlay.height = h
      renderer.render(scene, camera)
    }

    function ensureTexture(w: number, h: number) {
      if (w === frameW && h === frameH) return
      texture.dispose()
      frameW = w
      frameH = h
      frameBuffer = new Uint8Array(w * h * 4)
      texture = new THREE.DataTexture(frameBuffer, w, h)
      material.map = texture
      material.needsUpdate = true
      updateLayout()
    }

    updateLayout()

    const off = window.lights.onEvent((event) => {
      if (event.type === 'detection') {
        if (event.moduleId === 'HandPoseEstimation' && event.data.byteLength >= 1 + 21 * 12) {
          pendingHands.push(decodeHandpose(event.data))
        } else if (event.moduleId === 'FaceMesh' && event.data.byteLength >= 468 * 12) {
          pendingFaces.push(decodeFacemesh(event.data))
        }
        return
      }

      if (event.type !== 'frame') return
      ensureTexture(event.width, event.height)

      // Copy RGB24 → RGBA32 into the reused buffer
      if (event.data.byteLength === frameW * frameH * 3) {
        const src = new Uint8Array(event.data)
        for (let i = 0; i < frameW * frameH; i++) {
          frameBuffer[i * 4]     = src[i * 3]
          frameBuffer[i * 4 + 1] = src[i * 3 + 1]
          frameBuffer[i * 4 + 2] = src[i * 3 + 2]
          frameBuffer[i * 4 + 3] = 255
        }
        texture.needsUpdate = true
      }

      renderer.render(scene, camera)

      // Flush overlay: clear then redraw buffered detections
      const { clientWidth: cw, clientHeight: ch } = container
      ctx.clearRect(0, 0, cw, ch)
      const r = frameRect(cw, ch, frameW, frameH)
      if (pendingHands.length > 0) { drawHands(ctx, pendingHands, r); pendingHands = [] }
      if (pendingFaces.length > 0) { drawFaces(ctx, pendingFaces, r); pendingFaces = [] }
    })

    const observer = new ResizeObserver(updateLayout)
    observer.observe(container)

    return () => {
      off()
      observer.disconnect()
      geometry.dispose()
      material.dispose()
      texture.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      container.removeChild(overlay)
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
}

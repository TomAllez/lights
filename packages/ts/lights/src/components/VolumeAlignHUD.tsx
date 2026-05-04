import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useProject } from '../model/ProjectContext'
import type { VolumeCamera } from '../model/types'

// ── Repeat button ─────────────────────────────────────────────────────────────

function RepeatButton({
  action, children, style,
}: { action: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  const actionRef = useRef(action)
  actionRef.current = action

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  function start() {
    actionRef.current()
    timerRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => actionRef.current(), 80)
    }, 400)
  }

  function stop() {
    clearTimeout(timerRef.current)
    clearInterval(intervalRef.current)
  }

  return (
    <button className="icon-btn" style={style} onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}>
      {children}
    </button>
  )
}

// ── Camera math ───────────────────────────────────────────────────────────────

type V3 = { x: number; y: number; z: number }

function norm(v: V3): V3 {
  const l = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)
  return l === 0 ? { x: 0, y: 1, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l }
}
function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}
function add(a: V3, b: V3): V3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } }
function sub(a: V3, b: V3): V3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } }
function scale(v: V3, s: number): V3 { return { x: v.x * s, y: v.y * s, z: v.z * s } }

function orbitH(cam: VolumeCamera, deg: number): VolumeCamera {
  const a = deg * Math.PI / 180
  const o = sub(cam.position, cam.target)
  const cos = Math.cos(a), sin = Math.sin(a)
  return { ...cam, position: add(cam.target, { x: o.x * cos + o.z * sin, y: o.y, z: -o.x * sin + o.z * cos }) }
}

function orbitV(cam: VolumeCamera, deg: number): VolumeCamera {
  const a = deg * Math.PI / 180
  const o = sub(cam.position, cam.target)
  const r = Math.sqrt(o.x ** 2 + o.y ** 2 + o.z ** 2)
  const phi = Math.atan2(o.z, o.x)
  const theta = Math.acos(Math.max(-1, Math.min(1, o.y / r)))
  const t = Math.max(0.05, Math.min(Math.PI - 0.05, theta + a))
  return {
    ...cam,
    position: add(cam.target, {
      x: r * Math.sin(t) * Math.cos(phi),
      y: r * Math.cos(t),
      z: r * Math.sin(t) * Math.sin(phi),
    }),
  }
}

function panCamera(cam: VolumeCamera, dx: number, dy: number): VolumeCamera {
  const fwd = norm(sub(cam.target, cam.position))
  const right = norm(cross(fwd, { x: 0, y: 1, z: 0 }))
  const up = cross(right, fwd)
  const delta = add(scale(right, dx), scale(up, dy))
  return { ...cam, position: add(cam.position, delta), target: add(cam.target, delta) }
}

function dolly(cam: VolumeCamera, delta: number): VolumeCamera {
  return { ...cam, position: add(cam.position, scale(norm(sub(cam.target, cam.position)), delta)) }
}

function adjustFov(cam: VolumeCamera, delta: number): VolumeCamera {
  return { ...cam, fov: Math.max(10, Math.min(120, cam.fov + delta)) }
}

// ── Grid projection ───────────────────────────────────────────────────────────

// Project a finite floor grid (y = 0) through the camera.
// Finite points react to ALL camera changes: orbit, pan, dolly, and FOV.
// Lines naturally converge toward the two vanishing points, giving the
// two-point perspective visual while also reflecting position/zoom changes.
function computeGrid(cam: VolumeCamera, w: number, h: number) {
  const camera = new THREE.PerspectiveCamera(cam.fov, w / h, 0.1, 1e6)
  camera.position.set(cam.position.x, cam.position.y, cam.position.z)
  camera.lookAt(cam.target.x, cam.target.y, cam.target.z)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  function toScreen(wx: number, wy: number, wz: number) {
    const v = new THREE.Vector3(wx, wy, wz).project(camera)
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, inFront: v.z < 1 }
  }

  // Floor grid at y = 0, ±R world units in X and Z
  const R = 5
  const lines: [number, number, number, number][] = []
  for (let i = -R; i <= R; i++) {
    const a = toScreen(i, 0, -R), b = toScreen(i, 0, R)   // line along Z at x=i
    const c = toScreen(-R, 0, i), d = toScreen(R, 0, i)   // line along X at z=i
    if (a.inFront && b.inFront) lines.push([a.x, a.y, b.x, b.y])
    if (c.inFront && d.inFront) lines.push([c.x, c.y, d.x, d.y])
  }

  // Horizon: project two far points at camera eye-level (y = cam.position.y)
  // Both should land on the same screen y, giving us the horizon line.
  const BIG = 1e5
  const py = cam.position.y
  const hl = toScreen(cam.position.x - BIG, py, cam.position.z)
  const hr = toScreen(cam.position.x + BIG, py, cam.position.z)
  const horizonY = ((hl.inFront ? hl.y : hr.y) + (hr.inFront ? hr.y : hl.y)) / 2

  return { lines, horizonY }
}

// ── Step sizes ────────────────────────────────────────────────────────────────

const ORBIT_DEG  = 0.5
const PAN_UNIT   = 0.02
const DOLLY_UNIT = 0.05
const FOV_DEG    = 0.5

// ── Component ─────────────────────────────────────────────────────────────────

export default function VolumeAlignHUD() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId } = state
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height })
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const volume = slide?.volume

  // Always-current ref so keyboard handler never captures stale camera
  const nudgeRef = useRef<((fn: (cam: VolumeCamera) => VolumeCamera) => void) | null>(null)

  if (volume && selectedSlideId) {
    nudgeRef.current = (fn) =>
      dispatch({ type: 'volume:updateCamera', slideId: selectedSlideId, camera: fn(volume.camera) })
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!nudgeRef.current) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const nudge = nudgeRef.current
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); nudge(e.shiftKey ? c => panCamera(c, 0, +PAN_UNIT)  : c => orbitV(c, -ORBIT_DEG)); break
        case 'ArrowDown':  e.preventDefault(); nudge(e.shiftKey ? c => panCamera(c, 0, -PAN_UNIT)  : c => orbitV(c, +ORBIT_DEG)); break
        case 'ArrowLeft':  e.preventDefault(); nudge(e.shiftKey ? c => panCamera(c, -PAN_UNIT, 0)  : c => orbitH(c, -ORBIT_DEG)); break
        case 'ArrowRight': e.preventDefault(); nudge(e.shiftKey ? c => panCamera(c, +PAN_UNIT, 0)  : c => orbitH(c, +ORBIT_DEG)); break
        case '+': case '=': nudge(c => dolly(c, +DOLLY_UNIT)); break
        case '-': case '_': nudge(c => dolly(c, -DOLLY_UNIT)); break
        case ',': nudge(c => adjustFov(c, -FOV_DEG)); break
        case '.': nudge(c => adjustFov(c, +FOV_DEG)); break
        case 'Escape': dispatch({ type: 'volume:alignDone' }); break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  if (!volume || !selectedSlideId) return null

  function nudge(fn: (cam: VolumeCamera) => VolumeCamera) {
    dispatch({ type: 'volume:updateCamera', slideId: selectedSlideId!, camera: fn(volume!.camera) })
  }

  // ── Perspective grid lines ────────────────────────────────────────────────
  const { w, h } = size
  const { lines, horizonY: hy } = w > 0
    ? computeGrid(volume.camera, w, h)
    : { lines: [], horizonY: h * 0.42 }

  return (
    <div className="volume-align-hud">
      {/* Perspective grid overlay */}
      <svg ref={svgRef} className="volume-align-grid">
        {w > 0 && (
          <>
            <line x1={0} y1={hy} x2={w} y2={hy} stroke="rgba(96,165,250,0.35)" strokeWidth={1} strokeDasharray="6 4" />
            {lines.map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(96,165,250,0.15)" strokeWidth={1} />
            ))}
          </>
        )}
      </svg>

      {/* Camera controls */}
      <div className="volume-align-controls">
        <div className="volume-align-group">
          <span className="volume-align-label">Orbit <kbd>↑↓←→</kbd></span>
          <div className="volume-align-dpad">
            <RepeatButton style={{ gridArea: 'u' }} action={() => nudge(c => orbitV(c, -ORBIT_DEG))}>↑</RepeatButton>
            <RepeatButton style={{ gridArea: 'l' }} action={() => nudge(c => orbitH(c, -ORBIT_DEG))}>←</RepeatButton>
            <RepeatButton style={{ gridArea: 'r' }} action={() => nudge(c => orbitH(c, +ORBIT_DEG))}>→</RepeatButton>
            <RepeatButton style={{ gridArea: 'd' }} action={() => nudge(c => orbitV(c, +ORBIT_DEG))}>↓</RepeatButton>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">Pan <kbd>⇧↑↓←→</kbd></span>
          <div className="volume-align-dpad">
            <RepeatButton style={{ gridArea: 'u' }} action={() => nudge(c => panCamera(c, 0, +PAN_UNIT))}>↑</RepeatButton>
            <RepeatButton style={{ gridArea: 'l' }} action={() => nudge(c => panCamera(c, -PAN_UNIT, 0))}>←</RepeatButton>
            <RepeatButton style={{ gridArea: 'r' }} action={() => nudge(c => panCamera(c, +PAN_UNIT, 0))}>→</RepeatButton>
            <RepeatButton style={{ gridArea: 'd' }} action={() => nudge(c => panCamera(c, 0, -PAN_UNIT))}>↓</RepeatButton>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">Dolly <kbd>+</kbd><kbd>-</kbd></span>
          <div className="volume-align-pair">
            <RepeatButton action={() => nudge(c => dolly(c, +DOLLY_UNIT))}>+</RepeatButton>
            <RepeatButton action={() => nudge(c => dolly(c, -DOLLY_UNIT))}>−</RepeatButton>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">FOV <kbd>,</kbd><kbd>.</kbd></span>
          <div className="volume-align-pair">
            <RepeatButton action={() => nudge(c => adjustFov(c, +FOV_DEG))}>+</RepeatButton>
            <RepeatButton action={() => nudge(c => adjustFov(c, -FOV_DEG))}>−</RepeatButton>
          </div>
        </div>

        <button className="volume-align-done" onClick={() => dispatch({ type: 'volume:alignDone' })}>
          Done <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}

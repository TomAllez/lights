import { useEffect, useRef, useState } from 'react'
import { useProject } from '../model/ProjectContext'
import type { VolumeCamera } from '../model/types'

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

// ── Step sizes ────────────────────────────────────────────────────────────────

const ORBIT_DEG = 3
const PAN_UNIT  = 0.1
const DOLLY_UNIT = 0.2
const FOV_DEG   = 2

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
  if (!volume || !selectedSlideId) return null

  function nudge(fn: (cam: VolumeCamera) => VolumeCamera) {
    dispatch({ type: 'volume:updateCamera', slideId: selectedSlideId!, camera: fn(volume!.camera) })
  }

  // ── Perspective grid lines ────────────────────────────────────────────────
  const { w, h } = size
  const hy = h * 0.42
  const lvp = { x: -w * 0.4, y: hy }
  const rvp = { x: w * 1.4,  y: hy }

  const gridLines: [number, number, number, number][] = w > 0 ? [
    // From left VP → right and bottom edges
    ...[0, 0.15, 0.35, 0.55, 0.75, 1].map(t => [lvp.x, lvp.y, w, t * h] as [number, number, number, number]),
    ...[0.25, 0.5, 0.75].map(t => [lvp.x, lvp.y, t * w, h] as [number, number, number, number]),
    // From right VP → left and bottom edges
    ...[0, 0.15, 0.35, 0.55, 0.75, 1].map(t => [rvp.x, rvp.y, 0, t * h] as [number, number, number, number]),
    ...[0.25, 0.5, 0.75].map(t => [rvp.x, rvp.y, t * w, h] as [number, number, number, number]),
  ] : []

  return (
    <div className="volume-align-hud">
      {/* Perspective grid overlay */}
      <svg ref={svgRef} className="volume-align-grid">
        {w > 0 && (
          <>
            <line x1={0} y1={hy} x2={w} y2={hy} stroke="rgba(96,165,250,0.35)" strokeWidth={1} strokeDasharray="6 4" />
            {gridLines.map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(96,165,250,0.15)" strokeWidth={1} />
            ))}
          </>
        )}
      </svg>

      {/* Camera controls */}
      <div className="volume-align-controls">
        <div className="volume-align-group">
          <span className="volume-align-label">Orbit</span>
          <div className="volume-align-dpad">
            <button className="icon-btn" style={{ gridArea: 'u' }} onClick={() => nudge(c => orbitV(c, -ORBIT_DEG))}>↑</button>
            <button className="icon-btn" style={{ gridArea: 'l' }} onClick={() => nudge(c => orbitH(c, -ORBIT_DEG))}>←</button>
            <button className="icon-btn" style={{ gridArea: 'r' }} onClick={() => nudge(c => orbitH(c, +ORBIT_DEG))}>→</button>
            <button className="icon-btn" style={{ gridArea: 'd' }} onClick={() => nudge(c => orbitV(c, +ORBIT_DEG))}>↓</button>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">Pan</span>
          <div className="volume-align-dpad">
            <button className="icon-btn" style={{ gridArea: 'u' }} onClick={() => nudge(c => panCamera(c, 0, +PAN_UNIT))}>↑</button>
            <button className="icon-btn" style={{ gridArea: 'l' }} onClick={() => nudge(c => panCamera(c, -PAN_UNIT, 0))}>←</button>
            <button className="icon-btn" style={{ gridArea: 'r' }} onClick={() => nudge(c => panCamera(c, +PAN_UNIT, 0))}>→</button>
            <button className="icon-btn" style={{ gridArea: 'd' }} onClick={() => nudge(c => panCamera(c, 0, -PAN_UNIT))}>↓</button>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">Dolly</span>
          <div className="volume-align-pair">
            <button className="icon-btn" onClick={() => nudge(c => dolly(c, +DOLLY_UNIT))}>+</button>
            <button className="icon-btn" onClick={() => nudge(c => dolly(c, -DOLLY_UNIT))}>−</button>
          </div>
        </div>

        <div className="volume-align-group">
          <span className="volume-align-label">FOV</span>
          <div className="volume-align-pair">
            <button className="icon-btn" onClick={() => nudge(c => adjustFov(c, +FOV_DEG))}>+</button>
            <button className="icon-btn" onClick={() => nudge(c => adjustFov(c, -FOV_DEG))}>−</button>
          </div>
        </div>

        <button className="volume-align-done" onClick={() => dispatch({ type: 'volume:alignDone' })}>
          Done
        </button>
      </div>
    </div>
  )
}

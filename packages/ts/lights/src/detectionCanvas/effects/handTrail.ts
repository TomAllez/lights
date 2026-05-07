import { registerRenderer } from '../registry'

const TRAIL_DURATION_MS = 1200
const MAX_POINTS = 50
const RADIUS_MIN = 4
const RADIUS_MAX = 18

// [r, g, b] per hand
const HAND_COLOR: Record<string, [number, number, number]> = {
  right: [0,   230, 118],
  left:  [64,  196, 255],
}

interface TrailPoint { nx: number; ny: number; t: number }

registerRenderer('handTrail', () => {
  const trails = new Map<string, TrailPoint[]>()

  return {
    onDetection(event) {
      if (event.kind !== 'handpose') return
      const wrist = event.landmarks[0]
      const now = performance.now()

      if (!trails.has(event.moduleId)) trails.set(event.moduleId, [])
      const pts = trails.get(event.moduleId)!

      pts.push({ nx: wrist.x, ny: wrist.y, t: now })

      // Drop points older than the trail duration
      const cutoff = now - TRAIL_DURATION_MS
      const first = pts.findIndex(p => p.t > cutoff)
      if (first > 0) pts.splice(0, first)
      if (pts.length > MAX_POINTS) pts.splice(0, pts.length - MAX_POINTS)
    },

    render(ctx, w, h) {
      const now = performance.now()

      for (const [moduleId, pts] of trails) {
        if (pts.length === 0) continue
        const handedness = moduleId.endsWith('right') ? 'right' : 'left'
        const [r, g, b] = HAND_COLOR[handedness]

        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]
          const age = now - p.t
          if (age > TRAIL_DURATION_MS) continue

          // progress 0 = oldest visible point, 1 = newest
          const progress = i / Math.max(pts.length - 1, 1)
          const alpha = progress * (1 - age / TRAIL_DURATION_MS)
          const radius = RADIUS_MIN + progress * (RADIUS_MAX - RADIUS_MIN)

          ctx.beginPath()
          ctx.arc(p.nx * w, p.ny * h, radius, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
          ctx.fill()
        }
      }
    },

    dispose() {
      trails.clear()
    },
  }
})

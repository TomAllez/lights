import { registerRenderer } from '../registry'
import type { Landmark3D } from '../../ipc/detectionTypes'

const TTL = 1500
// Fraction of face width used as the connectivity threshold. Raise to connect
// more distant points; lower for a sparser mesh.
const THRESHOLD_RATIO = 0.065
const BLUE = '#4da6ff'

registerRenderer('faceMeshWire', () => {
  let landmarks: Landmark3D[] = []
  let edges: [number, number][] = []
  let lastDetection = -Infinity

  return {
    onDetection(event) {
      if (event.kind !== 'facemesh') return
      landmarks = event.landmarks
      lastDetection = performance.now()

      // Adaptive threshold: connect any two landmarks closer than
      // THRESHOLD_RATIO × face bounding-box width. Recomputed once per
      // detection so render stays a simple draw loop.
      let minX = Infinity, maxX = -Infinity
      for (const lm of landmarks) {
        if (lm.x < minX) minX = lm.x
        if (lm.x > maxX) maxX = lm.x
      }
      const threshSq = ((maxX - minX) * THRESHOLD_RATIO) ** 2

      edges = []
      for (let i = 0; i < landmarks.length; i++) {
        for (let j = i + 1; j < landmarks.length; j++) {
          const dx = landmarks[i].x - landmarks[j].x
          const dy = landmarks[i].y - landmarks[j].y
          if (dx * dx + dy * dy <= threshSq) edges.push([i, j])
        }
      }
    },

    render(ctx, w, h) {
      if (edges.length === 0) return
      const age = performance.now() - lastDetection
      if (age > TTL) return

      const alpha = 1 - age / TTL

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 0.6
      ctx.shadowColor = BLUE
      ctx.shadowBlur = 18

      ctx.beginPath()
      for (const [a, b] of edges) {
        ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h)
        ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h)
      }
      ctx.stroke()

      ctx.restore()
    },

    dispose() {
      landmarks = []
      edges = []
    },
  }
})

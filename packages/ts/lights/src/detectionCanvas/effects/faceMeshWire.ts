import { FACE_FEATURES } from '../../components/Canvas/landmarks'
import { registerRenderer } from '../registry'
import type { Landmark3D } from '../../ipc/detectionTypes'

const TTL = 1500  // ms before the mesh fades out after last detection

registerRenderer('faceMeshWire', () => {
  let landmarks: Landmark3D[] = []
  let lastDetection = -Infinity

  return {
    onDetection(event) {
      if (event.kind !== 'facemesh') return
      landmarks = event.landmarks
      lastDetection = performance.now()
    },

    render(ctx, w, h) {
      if (landmarks.length === 0) return
      const age = performance.now() - lastDetection
      if (age > TTL) return

      const alpha = 1 - age / TTL

      ctx.save()
      ctx.globalAlpha = alpha

      for (const { connections, color, lineWidth } of FACE_FEATURES) {
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.shadowColor = color
        ctx.shadowBlur = 5

        ctx.beginPath()
        for (const [a, b] of connections) {
          const la = landmarks[a], lb = landmarks[b]
          if (!la || !lb) continue
          ctx.moveTo(la.x * w, la.y * h)
          ctx.lineTo(lb.x * w, lb.y * h)
        }
        ctx.stroke()
      }

      ctx.restore()
    },

    dispose() {
      landmarks = []
    },
  }
})

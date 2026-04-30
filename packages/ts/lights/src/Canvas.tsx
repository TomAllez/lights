import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current!

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

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

    function updateAspect() {
      const winAspect = container.clientWidth / container.clientHeight
      const frameAspect = frameW / frameH
      if (winAspect > frameAspect) {
        mesh.scale.set(frameAspect / winAspect, 1, 1)
      } else {
        mesh.scale.set(1, winAspect / frameAspect, 1)
      }
      renderer.setSize(container.clientWidth, container.clientHeight)
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
      updateAspect()
    }

    updateAspect()

    const off = window.lights.onEvent((event) => {
      if (event.type !== 'frame') return
      ensureTexture(event.width, event.height)
      // Copy RGB24 → RGBA32 into the reused buffer (no allocation)
      if (event.data.byteLength === frameW * frameH * 3) {
        const src = new Uint8Array(event.data)
        for (let i = 0; i < frameW * frameH; i++) {
          frameBuffer[i * 4] = src[i * 3]
          frameBuffer[i * 4 + 1] = src[i * 3 + 1]
          frameBuffer[i * 4 + 2] = src[i * 3 + 2]
          frameBuffer[i * 4 + 3] = 255
        }
        texture.needsUpdate = true
      }
      renderer.render(scene, camera)
    })

    const observer = new ResizeObserver(updateAspect)
    observer.observe(container)

    return () => {
      off()
      observer.disconnect()
      geometry.dispose()
      material.dispose()
      texture.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

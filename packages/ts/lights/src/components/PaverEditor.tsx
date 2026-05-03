import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useProject } from '../model/ProjectContext'
import type { Paver } from '../model/types'

interface Props {
  paver: Paver
  slideId: string
  onClose: () => void
}

export default function PaverEditor({ paver, slideId, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { dispatch } = useProject()

  // Use a ref for the latest paver so the event handlers stay current without
  // re-running the heavy Three.js setup.
  const paverRef = useRef(paver)
  paverRef.current = paver

  useEffect(() => {
    const container = containerRef.current!
    const { width: w, height: h, depth: d } = paver.dimensions

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x1a1a2e)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 500)
    camera.position.set(w * 1.5, h * 1.5, d * 2.5)
    camera.lookAt(0, 0, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)

    // Grid at y = -h/2 (floor of bounding box)
    const grid = new THREE.GridHelper(Math.max(w, d) * 3, 20, 0x444466, 0x333355)
    grid.position.y = -h / 2
    scene.add(grid)

    // Ambient + directional light
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(w, h * 2, d * 2)
    scene.add(dir)

    // Bounding box wireframe
    const boxGeo = new THREE.BoxGeometry(w, h, d)
    const edges = new THREE.EdgesGeometry(boxGeo)
    const wireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x888888 }))
    scene.add(wireframe)
    boxGeo.dispose()

    // Cube group — rebuilt when cubes change
    const cubeGroup = new THREE.Group()
    scene.add(cubeGroup)

    function rebuildCubes() {
      cubeGroup.clear()
      for (const cube of paverRef.current.cubes) {
        const geo = new THREE.BoxGeometry(1, 1, 1)
        const mat = new THREE.MeshLambertMaterial({ color: 0x4a90d9 })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(...cube.position)
        mesh.userData = { cubeId: cube.id }
        cubeGroup.add(mesh)
      }
    }
    rebuildCubes()

    // Drag state
    let dragCubeId: string | null = null
    let dragPlane: THREE.Plane | null = null
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function getMouseNDC(e: MouseEvent) {
      const rect = container.getBoundingClientRect()
      mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      getMouseNDC(e)
      raycaster.setFromCamera(mouse, camera)

      // Check for cube hit first
      const cubeHits = raycaster.intersectObjects(cubeGroup.children)
      if (cubeHits.length > 0) {
        controls.enabled = false
        const mesh = cubeHits[0].object as THREE.Mesh
        dragCubeId = mesh.userData.cubeId as string
        // Drag plane: horizontal (y = cube center y)
        dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -mesh.position.y)
        return
      }

      // Grid hit → place cube
      const gridHit = raycaster.intersectObject(grid)
      if (gridHit.length > 0) {
        const pt = gridHit[0].point
        // Snap to integer units
        const pos: [number, number, number] = [
          Math.round(pt.x),
          Math.round(-h/2 + 0.5),  // sit on floor
          Math.round(pt.z),
        ]
        dispatch({ type: 'volume:addCube', slideId, volumeId: paverRef.current.id, position: pos })
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragCubeId || !dragPlane) return
      getMouseNDC(e)
      raycaster.setFromCamera(mouse, camera)
      const pt = new THREE.Vector3()
      raycaster.ray.intersectPlane(dragPlane, pt)
      if (!pt) return
      const mesh = cubeGroup.children.find(c => c.userData.cubeId === dragCubeId) as THREE.Mesh | undefined
      if (mesh) mesh.position.set(pt.x, mesh.position.y, pt.z)
    }

    function onMouseUp() {
      if (!dragCubeId) return
      const mesh = cubeGroup.children.find(c => c.userData.cubeId === dragCubeId) as THREE.Mesh | undefined
      if (mesh) {
        dispatch({
          type: 'volume:moveCube',
          slideId,
          volumeId: paverRef.current.id,
          cubeId: dragCubeId,
          position: [mesh.position.x, mesh.position.y, mesh.position.z],
        })
      }
      dragCubeId = null
      dragPlane = null
      controls.enabled = true
    }

    renderer.domElement.addEventListener('mousedown', onMouseDown)
    renderer.domElement.addEventListener('mousemove', onMouseMove)
    renderer.domElement.addEventListener('mouseup', onMouseUp)

    let animId = 0
    function animate() {
      animId = requestAnimationFrame(animate)
      controls.update()
      rebuildCubes()
      renderer.render(scene, camera)
    }
    animate()

    const observer = new ResizeObserver(() => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
    })
    observer.observe(container)

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      renderer.domElement.removeEventListener('mouseup', onMouseUp)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paver.id, paver.dimensions])

  return (
    <div className="paver-editor-overlay">
      <div className="paver-editor-header">
        <span className="paver-editor-title">{paver.name} — 3D Editor</span>
        <button className="icon-btn" onClick={onClose}>×</button>
      </div>
      <div ref={containerRef} className="paver-editor-canvas" />
    </div>
  )
}

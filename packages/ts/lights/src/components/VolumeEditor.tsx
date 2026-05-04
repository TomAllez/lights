import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { useProject } from '../model/ProjectContext'
import { buildShapeMesh, disposeShapeMesh } from '../shaders/volumeScene'
import type { VolumeShape } from '../model/types'

export default function VolumeEditor() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedShapeId, volumeEditorMode } = state
  const containerRef = useRef<HTMLDivElement>(null)

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const volume = slide?.volume

  // Refs for Three.js objects shared between setup and reactive effects
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

  // Refs for Three.js objects shared between setup and reactive effects
  const rendererRef   = useRef<THREE.WebGLRenderer | null>(null)
  const editorCamRef  = useRef<THREE.PerspectiveCamera | null>(null)
  const orbitRef      = useRef<OrbitControls | null>(null)
  const transformRef  = useRef<TransformControls | null>(null)
  const meshMapRef    = useRef<Map<string, THREE.Mesh>>(new Map())
  const shapeGroupRef = useRef<THREE.Group | null>(null)
  const ghostCamRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const ghostHelperRef = useRef<THREE.CameraHelper | null>(null)
  const renderRef     = useRef<() => void>(() => {})
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedShapeId

  // ── Three.js setup (once) ─────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current!

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x0a0a0a)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()

    // Editor camera (free orbit)
    const aspect = container.clientWidth / container.clientHeight
    const editorCam = new THREE.PerspectiveCamera(60, aspect, 0.01, 1000)
    editorCam.position.set(4, 3, 6)
    editorCam.lookAt(0, 0, 0)
    editorCamRef.current = editorCam

    // Orbit controls
    const orbit = new OrbitControls(editorCam, renderer.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.1
    orbitRef.current = orbit

    // Ground grid + axes
    scene.add(new THREE.GridHelper(10, 10, 0x222222, 0x1a1a1a))
    scene.add(new THREE.AxesHelper(1))

    // Ambient + directional light (for future textured shapes)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 8, 5)
    scene.add(dir)

    // Shape group
    const shapeGroup = new THREE.Group()
    scene.add(shapeGroup)
    shapeGroupRef.current = shapeGroup

    // Ghost frustum (projection camera preview)
    const ghostCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 20)
    ghostCamRef.current = ghostCam
    const ghostHelper = new THREE.CameraHelper(ghostCam)
    scene.add(ghostHelper)
    ghostHelperRef.current = ghostHelper

    // Transform controls
    const transform = new TransformControls(editorCam, renderer.domElement)
    transform.setSize(0.8)
    scene.add(transform.getHelper())
    transformRef.current = transform

    // Pause orbit while dragging transform gizmo
    transform.addEventListener('dragging-changed', (e) => {
      orbit.enabled = !(e as unknown as { value: boolean }).value
    })

    // Dispatch shape update when drag ends
    transform.addEventListener('mouseUp', () => {
      const mesh = transform.object as THREE.Mesh | undefined
      if (!mesh || !selectedIdRef.current || !selectedSlideId) return
      const shape = (mesh.userData as { shape: VolumeShape }).shape
      dispatch({
        type: 'volume:shapeUpdate',
        slideId: selectedSlideId,
        shape: {
          ...shape,
          position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
          rotation: {
            x: mesh.rotation.x * 180 / Math.PI,
            y: mesh.rotation.y * 180 / Math.PI,
            z: mesh.rotation.z * 180 / Math.PI,
          },
          scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
        },
      })
    })

    // Click to select shape
    const raycaster = new THREE.Raycaster()
    function onClick(e: MouseEvent) {
      if (transform.dragging) return
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(mouse, editorCam)
      const meshes = [...meshMapRef.current.values()]
      const hits = raycaster.intersectObjects(meshes)
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh
        const shapeId = (hit.userData as { shape: VolumeShape }).shape.id
        dispatch({ type: 'volume:shapeSelect', shapeId })
      } else {
        dispatch({ type: 'volume:shapeSelect', shapeId: null })
      }
    }
    renderer.domElement.addEventListener('click', onClick)

    const render = () => {
      orbit.update()
      renderer.render(scene, editorCam)
    }
    renderRef.current = render

    // Animate loop
    let animId: number
    function animate() { animId = requestAnimationFrame(animate); render() }
    animate()

    // Resize
    function onResize() {
      const { clientWidth: w, clientHeight: h } = container
      renderer.setSize(w, h)
      editorCam.aspect = w / h
      editorCam.updateProjectionMatrix()
      ghostCam.aspect = w / h
      ghostCam.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(container)

    return () => {
      cancelAnimationFrame(animId)
      observer.disconnect()
      renderer.domElement.removeEventListener('click', onClick)
      orbit.dispose()
      transform.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync shapes from state → scene ───────────────────────────────────────
  useEffect(() => {
    const group = shapeGroupRef.current
    const transform = transformRef.current
    if (!group || !transform) return

    // Dispose old meshes
    for (const mesh of meshMapRef.current.values()) disposeShapeMesh(mesh)
    meshMapRef.current.clear()
    group.clear()

    if (volume) {
      for (const shape of volume.shapes) {
        const mesh = buildShapeMesh(shape)
        mesh.userData = { shape }
        meshMapRef.current.set(shape.id, mesh)
        group.add(mesh)
      }
    }

    // Re-attach transform to selected shape (if it still exists)
    const sel = selectedShapeId ? meshMapRef.current.get(selectedShapeId) : undefined
    if (sel) transform.attach(sel)
    else transform.detach()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume?.shapes])

  // ── Sync selected shape → TransformControls ───────────────────────────────
  useEffect(() => {
    const transform = transformRef.current
    if (!transform) return
    const mesh = selectedShapeId ? meshMapRef.current.get(selectedShapeId) : undefined
    if (mesh) transform.attach(mesh)
    else transform.detach()
  }, [selectedShapeId])

  // ── Sync ghost frustum from Volume.camera ─────────────────────────────────
  useEffect(() => {
    const ghostCam = ghostCamRef.current
    const helper = ghostHelperRef.current
    if (!ghostCam || !helper || !volume) return
    const { position: p, target: t, fov } = volume.camera
    ghostCam.position.set(p.x, p.y, p.z)
    ghostCam.lookAt(t.x, t.y, t.z)
    ghostCam.fov = fov
    ghostCam.updateProjectionMatrix()
    helper.update()
  }, [volume?.camera])

  // ── Sync gizmo mode → TransformControls ──────────────────────────────────
  useEffect(() => {
    transformRef.current?.setMode(gizmoMode)
  }, [gizmoMode])

  // ── Keyboard shortcuts for gizmo mode ────────────────────────────────────
  const volumeEditorModeRef = useRef(volumeEditorMode)
  volumeEditorModeRef.current = volumeEditorMode
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!volumeEditorModeRef.current) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 't' || e.key === 'T') setGizmoMode('translate')
      if (e.key === 'r' || e.key === 'R') setGizmoMode('rotate')
      if (e.key === 's' || e.key === 'S') setGizmoMode('scale')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!volume || !volumeEditorMode) return null

  function snapToProjector() {
    const cam = editorCamRef.current
    const orbit = orbitRef.current
    if (!cam || !orbit || !volume) return
    const { position: p, target: t } = volume.camera
    cam.position.set(p.x, p.y, p.z)
    orbit.target.set(t.x, t.y, t.z)
    orbit.update()
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="volume-editor-toolbar">
        <button className="icon-btn" title="Back to stage" onClick={() => dispatch({ type: 'volume:editorExit' })}>
          ←
        </button>
        <span className="volume-editor-title">{volume.name}</span>
        <div className="volume-editor-gizmo-modes">
          {(['translate', 'rotate', 'scale'] as const).map(mode => (
            <button
              key={mode}
              className={`volume-editor-mode-btn${gizmoMode === mode ? ' active' : ''}`}
              onClick={() => setGizmoMode(mode)}
              title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} (${mode[0].toUpperCase()})`}
            >
              {mode === 'translate' ? 'Move' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button className="volume-editor-projector-btn" onClick={snapToProjector}>
          View from projector
        </button>
      </div>
    </div>
  )
}

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Volume, VolumeShape, VolumeShapeType } from '../model/types'
import { buildShapeMesh, disposeShapeMesh } from '../shaders/volumeScene'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface VolumeSceneOptions {
  container: HTMLElement
  onShapeSelect: (shapeId: string | null) => void
  onShapeUpdate: (shape: VolumeShape) => void
}

export class VolumeScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private editorCam: THREE.PerspectiveCamera
  private orbit: OrbitControls
  private transform: TransformControls
  private ghostCam: THREE.PerspectiveCamera
  private ghostHelper: THREE.CameraHelper
  
  private meshMap = new Map<string, THREE.Mesh>()
  private shapeGroup = new THREE.Group()
  
  private options: VolumeSceneOptions
  private animId: number = 0
  private resizeObserver: ResizeObserver

  constructor(options: VolumeSceneOptions) {
    this.options = options
    const { container } = options

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setClearColor(0x0a0a0a)
    container.appendChild(this.renderer.domElement)

    // 2. Scene Base
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.GridHelper(10, 10, 0x222222, 0x1a1a1a))
    this.scene.add(new THREE.AxesHelper(1))
    
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 8, 5)
    this.scene.add(dir)

    this.scene.add(this.shapeGroup)

    // 3. Cameras & Controls
    const aspect = container.clientWidth / container.clientHeight
    this.editorCam = new THREE.PerspectiveCamera(60, aspect, 0.01, 1000)
    this.editorCam.position.set(4, 3, 6)
    this.editorCam.lookAt(0, 0, 0)

    this.orbit = new OrbitControls(this.editorCam, this.renderer.domElement)
    this.orbit.enableDamping = true
    this.orbit.dampingFactor = 0.1

    this.ghostCam = new THREE.PerspectiveCamera(50, aspect, 0.1, 20)
    this.ghostHelper = new THREE.CameraHelper(this.ghostCam)
    this.scene.add(this.ghostHelper)

    this.transform = new TransformControls(this.editorCam, this.renderer.domElement)
    this.transform.setSize(0.8)
    this.scene.add(this.transform.getHelper())

    // 4. Interaction Events
    this.setupEvents()

    // 5. Lifecycle
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
    this.animate()
  }

  private setupEvents() {
    // Pause orbit while dragging transform gizmo
    this.transform.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !(e as any).value
    })

    // Dispatch shape update when drag ends
    this.transform.addEventListener('mouseUp', () => {
      const mesh = this.transform.object as THREE.Mesh | undefined
      if (!mesh) return
      
      const shape = (mesh.userData as { shape: VolumeShape }).shape
      this.options.onShapeUpdate({
        ...shape,
        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        rotation: {
          x: mesh.rotation.x * 180 / Math.PI,
          y: mesh.rotation.y * 180 / Math.PI,
          z: mesh.rotation.z * 180 / Math.PI,
        },
        scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
      })
    })

    // Click to select
    this.renderer.domElement.addEventListener('click', this.onClick)
  }

  private onClick = (e: MouseEvent) => {
    if (this.transform.dragging) return
    
    const rect = this.renderer.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, this.editorCam)
    
    const hits = raycaster.intersectObjects([...this.meshMap.values()])
    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Mesh
      const shapeId = (hit.userData as { shape: VolumeShape }).shape.id
      this.options.onShapeSelect(shapeId)
    } else {
      this.options.onShapeSelect(null)
    }
  }

  private onResize() {
    const { clientWidth: w, clientHeight: h } = this.options.container
    this.renderer.setSize(w, h)
    
    this.editorCam.aspect = w / h
    this.editorCam.updateProjectionMatrix()
    
    this.ghostCam.aspect = w / h
    this.ghostCam.updateProjectionMatrix()
  }

  private animate = () => {
    this.animId = requestAnimationFrame(this.animate)
    this.orbit.update()
    this.renderer.render(this.scene, this.editorCam)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getMeshByShapeId(shapeId: string | null): THREE.Mesh | undefined {
    if (!shapeId) return undefined
    return this.meshMap.get(shapeId)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  syncVolume(volume: Volume | undefined, selectedShapeId: string | null) {
    const currentShapes = volume?.shapes || []
    
    // 1. Identify which meshes to add, update, or remove
    const shapeIds = new Set(currentShapes.map(s => s.id))
    
    // Remove old meshes
    for (const [id, mesh] of this.meshMap.entries()) {
      if (!shapeIds.has(id)) {
        if (this.transform.object === mesh) this.transform.detach()
        disposeShapeMesh(mesh)
        this.shapeGroup.remove(mesh)
        this.meshMap.delete(id)
      }
    }

    // Add or Update meshes
    for (const shape of currentShapes) {
      let mesh = this.meshMap.get(shape.id)
      
      if (!mesh) {
        // Create new
        mesh = buildShapeMesh(shape)
        mesh.userData = { shape }
        this.meshMap.set(shape.id, mesh)
        this.shapeGroup.add(mesh)
      } else {
        // Update existing (position, rotation, scale)
        // We only update if the shape data has changed (simple comparison)
        const oldShape = mesh.userData.shape as VolumeShape
        if (JSON.stringify(oldShape) !== JSON.stringify(shape)) {
          mesh.position.set(shape.position.x, shape.position.y, shape.position.z)
          mesh.rotation.set(
            shape.rotation.x * Math.PI / 180,
            shape.rotation.y * Math.PI / 180,
            shape.rotation.z * Math.PI / 180,
          )
          mesh.scale.set(shape.scale.x, shape.scale.y, shape.scale.z)
          mesh.userData.shape = shape
          
          // Note: if shape type changed, we might need to rebuild geometry,
          // but usually shape type is immutable for a given ID in this app.
        }
      }
    }

    // 2. Sync selection
    const sel = selectedShapeId ? this.meshMap.get(selectedShapeId) : undefined
    if (sel) this.transform.attach(sel)
    else this.transform.detach()

    // 3. Sync ghost camera
    if (volume) {
      const { position: p, target: t, fov } = volume.camera
      this.ghostCam.position.set(p.x, p.y, p.z)
      this.ghostCam.lookAt(t.x, t.y, t.z)
      this.ghostCam.fov = fov
      this.ghostCam.updateProjectionMatrix()
      this.ghostHelper.update()
    }
  }

  setGizmoMode(mode: GizmoMode) {
    this.transform.setMode(mode)
  }

  snapToProjector(volume: Volume) {
    const { position: p, target: t } = volume.camera
    this.editorCam.position.set(p.x, p.y, p.z)
    this.orbit.target.set(t.x, t.y, t.z)
    this.orbit.update()
  }

  dispose() {
    cancelAnimationFrame(this.animId)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.orbit.dispose()
    this.transform.dispose()
    this.renderer.dispose()
    this.options.container.removeChild(this.renderer.domElement)
    
    for (const mesh of this.meshMap.values()) disposeShapeMesh(mesh)
  }
}

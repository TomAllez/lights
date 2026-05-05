import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Volume, VolumeShape, VolumeEditMode } from './types'
import { buildShapeMesh, disposeShapeMesh } from './volumeScene'

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
  private selectedShapeId: string | null = null
  
  private options: VolumeSceneOptions
  private animId: number = 0
  private resizeObserver: ResizeObserver

  private editMode: VolumeEditMode = 'object'
  private handles: THREE.Group = new THREE.Group()
  private selectedComponentIndices: number[] | null = null
  private componentProxy = new THREE.Object3D()

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
    this.scene.add(this.handles)
    this.scene.add(this.componentProxy)

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
      this.orbit.enabled = !e.value
    })

    // Dispatch shape update when drag ends
    this.transform.addEventListener('mouseUp', () => {
      if (this.editMode !== 'object' && this.selectedComponentIndices !== null) {
        this.saveComponentChange()
        return
      }

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

    this.transform.addEventListener('change', () => {
      if (this.editMode !== 'object' && this.selectedComponentIndices !== null && this.transform.dragging) {
        this.applyComponentDragging()
      }
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
    
    if (this.editMode !== 'object') {
      const hits = raycaster.intersectObjects(this.handles.children)
      if (hits.length > 0) {
        const handle = hits[0].object
        this.selectedComponentIndices = handle.userData.indices
        this.componentProxy.position.copy(handle.position)
        this.transform.attach(this.componentProxy)
      } else {
        this.selectedComponentIndices = null
        this.transform.detach()
      }
      return
    }

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

  // ── Mesh Component Editing ──────────────────────────────────────────
  
  deleteSelectedComponent() {
    if (!this.selectedShapeId || !this.selectedComponentIndices) return
    const mesh = this.meshMap.get(this.selectedShapeId)
    if (!mesh) return

    const geo = mesh.geometry
    let indices = geo.getIndex()?.array ? Array.from(geo.getIndex()!.array) : null
    const positions = geo.getAttribute('position') as THREE.BufferAttribute
    
    if (!indices) {
      indices = []
      for (let i = 0; i < positions.count; i++) indices.push(i)
    }

    const toRemove = new Set(this.selectedComponentIndices)
    
    // 1. Remove all triangles that use ANY of the selected vertices
    const newIndices: number[] = []
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]
      const b = indices[i + 1]
      const c = indices[i + 2]
      if (!toRemove.has(a) && !toRemove.has(b) && !toRemove.has(c)) {
        newIndices.push(a, b, c)
      }
    }

    // 2. Remove selected vertices from the position buffer
    const newVertices: number[] = []
    const indexMap = new Map<number, number>()
    let nextIdx = 0
    for (let i = 0; i < positions.count; i++) {
      if (toRemove.has(i)) continue
      newVertices.push(positions.getX(i), positions.getY(i), positions.getZ(i))
      indexMap.set(i, nextIdx++)
    }

    // 3. Shift indices to match new position buffer
    const finalIndices = newIndices.map(idx => indexMap.get(idx)!)

    const shape = (mesh.userData as { shape: VolumeShape }).shape
    this.options.onShapeUpdate({
      ...shape,
      vertices: newVertices,
      indices: finalIndices
    })

    this.selectedComponentIndices = null
    this.transform.detach()
  }

  private applyComponentDragging() {
    if (!this.selectedShapeId || !this.selectedComponentIndices) return
    const mesh = this.meshMap.get(this.selectedShapeId)
    if (!mesh) return

    const worldPos = this.componentProxy.position
    
    // Update visual handle position (it's in world space)
    const handle = this.handles.children.find(c => {
      const hIndices = c.userData.indices as number[]
      return hIndices.length === this.selectedComponentIndices!.length && 
             hIndices.every((v, i) => v === this.selectedComponentIndices![i])
    })
    if (handle) handle.position.copy(worldPos)

    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    mesh.updateMatrixWorld()
    
    // @ts-expect-error Three.js Mesh has matrixWorldInverse but it might not be in the typings
    mesh.matrixWorldInverse.copy(mesh.matrixWorld).invert()

    // Calculate delta in local space? No, easier to just move each vertex to its new local position.
    // We need to know where the component was relative to the proxy when drag started.
    // Actually, TransformControls moves the proxy. We can just compute the new world position
    // of each vertex and convert back to local.
    // But since handles are shared, and we might select an edge/face, 
    // all vertices in selectedComponentIndices should move by the same world delta.

    // Let's use a simpler approach: 
    // Each vertex in the component will be moved so that their center matches the proxy.
    // Wait, if I move one vertex of an edge, I want just that vertex to move.
    // If I move the edge handle, I want both vertices to move by the same amount.

    if (!this._dragStartPos || !this._vertexStartPos) {
        this._dragStartPos = worldPos.clone()
        this._vertexStartPos = this.selectedComponentIndices.map(idx => {
            const v = new THREE.Vector3(attr.getX(idx), attr.getY(idx), attr.getZ(idx))
            v.applyMatrix4(mesh.matrixWorld)
            return v
        })
    }

    const delta = new THREE.Vector3().subVectors(worldPos, this._dragStartPos)

    for (let i = 0; i < this.selectedComponentIndices.length; i++) {
        const idx = this.selectedComponentIndices[i]
        const startWorld = this._vertexStartPos[i]
        const newWorld = startWorld.clone().add(delta)
        const newLocal = newWorld.clone()
        mesh.worldToLocal(newLocal)
        attr.setXYZ(idx, newLocal.x, newLocal.y, newLocal.z)
    }

    attr.needsUpdate = true
    mesh.geometry.computeVertexNormals()
  }

  private _dragStartPos: THREE.Vector3 | null = null
  private _vertexStartPos: THREE.Vector3[] | null = null

  private saveComponentChange() {
    this._dragStartPos = null
    this._vertexStartPos = null
    
    if (!this.selectedShapeId) return
    const mesh = this.meshMap.get(this.selectedShapeId)
    if (!mesh) return

    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const vertices: number[] = []
    for (let i = 0; i < attr.count; i++) {
      vertices.push(attr.getX(i), attr.getY(i), attr.getZ(i))
    }

    const indicesAttr = mesh.geometry.getIndex()
    const indices = indicesAttr ? Array.from(indicesAttr.array) : undefined

    const shape = (mesh.userData as { shape: VolumeShape }).shape
    this.options.onShapeUpdate({
      ...shape,
      vertices,
      indices
    })
  }

  private updateHandles(mesh: THREE.Mesh | undefined) {
    this.handles.clear()
    this.selectedComponentIndices = null
    if (this.editMode === 'object' || !mesh) return

    const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const indicesAttr = mesh.geometry.getIndex()
    const indices = indicesAttr ? Array.from(indicesAttr.array) : null
    
    mesh.updateMatrixWorld()

    if (this.editMode === 'vertex') {
      const geo = new THREE.SphereGeometry(0.04)
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
      for (let i = 0; i < attr.count; i++) {
        const handle = new THREE.Mesh(geo, mat)
        handle.position.set(attr.getX(i), attr.getY(i), attr.getZ(i))
        handle.applyMatrix4(mesh.matrixWorld)
        handle.userData.indices = [i]
        this.handles.add(handle)
      }
    } else if (this.editMode === 'edge' && indices) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x0000ff })
      const geo = new THREE.SphereGeometry(0.03) // Small handles on edges
      const edges = new Set<string>()
      for (let i = 0; i < indices.length; i += 3) {
        const tri = [indices[i], indices[i+1], indices[i+2]]
        for (let j = 0; j < 3; j++) {
          const a = tri[j]
          const b = tri[(j + 1) % 3]
          const key = [a, b].sort().join('-')
          if (!edges.has(key)) {
            edges.add(key)
            const handle = new THREE.Mesh(geo, mat)
            const va = new THREE.Vector3(attr.getX(a), attr.getY(a), attr.getZ(a))
            const vb = new THREE.Vector3(attr.getX(b), attr.getY(b), attr.getZ(b))
            handle.position.addVectors(va, vb).multiplyScalar(0.5)
            handle.applyMatrix4(mesh.matrixWorld)
            handle.userData.indices = [a, b]
            this.handles.add(handle)
          }
        }
      }
    } else if (this.editMode === 'face' && indices) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 })
      const geo = new THREE.SphereGeometry(0.05)
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i+1], c = indices[i+2]
        const handle = new THREE.Mesh(geo, mat)
        const va = new THREE.Vector3(attr.getX(a), attr.getY(a), attr.getZ(a))
        const vb = new THREE.Vector3(attr.getX(b), attr.getY(b), attr.getZ(b))
        const vc = new THREE.Vector3(attr.getX(c), attr.getY(c), attr.getZ(c))
        handle.position.addVectors(va, vb).add(vc).multiplyScalar(1/3)
        handle.applyMatrix4(mesh.matrixWorld)
        handle.userData.indices = [a, b, c]
        this.handles.add(handle)
      }
    }
  }


  // ── Public API ─────────────────────────────────────────────────────────────

  syncVolume(volume: Volume | undefined, selectedShapeId: string | null, editMode: VolumeEditMode = 'object') {
    const currentShapes = volume?.shapes || []
    const modeChanged = this.editMode !== editMode
    const selectionChanged = this.selectedShapeId !== selectedShapeId
    
    this.editMode = editMode
    this.selectedShapeId = selectedShapeId

    // 1. Identify which meshes to add, update, or remove
    const shapeIds = new Set(currentShapes.map((s: VolumeShape) => s.id))
    
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
      const mesh = this.meshMap.get(shape.id)
      
      if (!mesh) {
        // Create new
        const newMesh = buildShapeMesh(shape)
        newMesh.userData = { shape }
        this.meshMap.set(shape.id, newMesh)
        this.shapeGroup.add(newMesh)
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

    if (this.editMode !== 'object') {
      if (selectionChanged || modeChanged) {
        this.updateHandles(sel)
        this.transform.detach()
      }
    } else {
      this.handles.clear()
      if (sel) this.transform.attach(sel)
      else this.transform.detach()
    }

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

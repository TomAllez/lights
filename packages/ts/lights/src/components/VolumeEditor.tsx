import { useEffect, useRef, useState } from 'react'
import { useProject } from '../model/ProjectContext'
import { VolumeScene, type GizmoMode } from '../three/VolumeSceneManager'
import type { VolumeEditMode } from '../model/types'

export default function VolumeEditor() {
  const { state, dispatch } = useProject()
  const { project, selectedSlideId, selectedShapeId, editorMode, volumeEditMode } = state
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<VolumeScene | null>(null)

  const slide = project.slides.find(s => s.id === selectedSlideId)
  const volume = slide?.volume

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate')

  // ── Lifecycle: Initialize VolumeScene ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const scene = new VolumeScene({
      container: containerRef.current,
      onShapeSelect: (shapeId) => {
        dispatch({ type: 'volume:shapeSelect', shapeId })
      },
      onShapeUpdate: (shape) => {
        if (selectedSlideId) {
          dispatch({ type: 'volume:shapeUpdate', slideId: selectedSlideId, shape })
        }
      }
    })

    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [dispatch, selectedSlideId])

  // ── Sync: Volume Data & Selection ──────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.syncVolume(volume, selectedShapeId, volumeEditMode)
  }, [volume, selectedShapeId, volumeEditMode])

  // ── Sync: Gizmo Mode ───────────────────────────────────────────────────────
  useEffect(() => {
    sceneRef.current?.setGizmoMode(gizmoMode)
  }, [gizmoMode])

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (editorMode !== 'volume-editor') return

    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const key = e.key.toLowerCase()
      if (key === 't') setGizmoMode('translate')
      if (key === 'r') setGizmoMode('rotate')
      if (key === 's') setGizmoMode('scale')
      if (key === 'tab') {
        e.preventDefault()
        dispatch({ type: 'volume:editModeSet', mode: volumeEditMode === 'object' ? 'vertex' : 'object' })
      }
      if ((key === 'delete' || key === 'backspace') && volumeEditMode === 'vertex') {
        sceneRef.current?.deleteSelectedVertex()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editorMode, volumeEditMode, dispatch])

  if (!volume || editorMode !== 'volume-editor') return null

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="volume-editor-toolbar">
        <button className="icon-btn" title="Back to stage" onClick={() => dispatch({ type: 'volume:editorExit' })}>
          ←
        </button>
        <span className="volume-editor-title">{volume.name}</span>
        <div className="volume-editor-gizmo-modes">
          {(['object', 'vertex'] as const).map(mode => (
            <button
              key={mode}
              className={`volume-editor-mode-btn${volumeEditMode === mode ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'volume:editModeSet', mode })}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)} Mode
            </button>
          ))}
        </div>
        <div className="volume-editor-separator" />
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
        <button 
          className="volume-editor-projector-btn" 
          onClick={() => volume && sceneRef.current?.snapToProjector(volume)}
        >
          View from projector
        </button>
      </div>
    </div>
  )
}

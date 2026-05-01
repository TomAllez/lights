import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import SlidePanel from './components/SlidePanel'
import StageOverlay from './components/StageOverlay'
import SurfaceCanvas from './components/SurfaceCanvas'
import SurfacePanel from './components/SurfacePanel'
import { useProject } from './model/ProjectContext'

export default function App() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'error'>('stopped')
  const { state } = useProject()
  const inSurfaceMode = state.surfaceMode

  useEffect(() => {
    return window.lights.onEvent((event) => {
      if (event.type === 'graph:status') setStatus(event.status)
    })
  }, [])

  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {inSurfaceMode ? (
          <SurfaceCanvas />
        ) : (
          <div className="stage-canvas">
            <Canvas />
            <StageOverlay />
          </div>
        )}
        <span className="status">{status}</span>
      </div>
      <SurfacePanel />
    </div>
  )
}

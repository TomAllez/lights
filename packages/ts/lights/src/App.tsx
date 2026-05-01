import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import SlidePanel from './SlidePanel'
import StageOverlay from './StageOverlay'
import SurfaceCanvas from './SurfaceCanvas'
import SurfacePanel from './SurfacePanel'
import { useProject } from './model/ProjectContext'

export default function App() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'error'>('stopped')
  const { state } = useProject()
  const inSurfaceMode = state.selectedSurfaceId !== null

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

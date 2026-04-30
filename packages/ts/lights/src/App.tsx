import { useEffect, useState } from 'react'
import Canvas from './Canvas'
import SlidePanel from './SlidePanel'

export default function App() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'error'>('stopped')

  useEffect(() => {
    return window.lights.onEvent((event) => {
      if (event.type === 'graph:status') setStatus(event.status)
    })
  }, [])

  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        <div className="stage-canvas">
          <Canvas />
        </div>
        <span className="status">{status}</span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import Canvas from './Canvas'

export default function App() {
  const [status, setStatus] = useState<'running' | 'stopped' | 'error'>('stopped')

  useEffect(() => {
    return window.lights.onEvent((event) => {
      if (event.type === 'graph:status') setStatus(event.status)
    })
  }, [])

  return (
    <div className="app">
      <Canvas />
      <span className="status">{status}</span>
    </div>
  )
}

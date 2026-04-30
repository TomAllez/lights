import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState<'connected' | 'running' | 'stopped' | 'error'>('connected')

  useEffect(() => {
    return window.lights.onEvent((event) => {
      if (event.type === 'graph:status') setStatus(event.status)
    })
  }, [])

  return (
    <div className="app">
      <span className="status">{status}</span>
    </div>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import App from './App'
import OutputApp from './OutputApp'
import { ProjectProvider } from './model/ProjectContext'

const isOutput = new URLSearchParams(window.location.search).has('output')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOutput ? (
      <OutputApp />
    ) : (
      <ProjectProvider>
        <App />
      </ProjectProvider>
    )}
  </StrictMode>
)

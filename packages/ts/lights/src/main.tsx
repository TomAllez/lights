import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import App from './App'
import OutputApp from './OutputApp'
import { ProjectProvider } from './contexts'
import { GraphProvider } from './contexts'

const isOutput = new URLSearchParams(window.location.search).has('output')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOutput ? (
      <OutputApp />
    ) : (
      <ProjectProvider>
        <GraphProvider>
          <App />
        </GraphProvider>
      </ProjectProvider>
    )}
  </StrictMode>
)

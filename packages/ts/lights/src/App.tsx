import { useEffect, useState } from 'react';

import { Canvas, SlidePanel, StageOverlay, SurfaceCanvas, SurfacePanel } from './components';
import { useProject } from './model';
import { GraphStatus } from './ipc/types';

export default function App() {
  const [status, setStatus] = useState<GraphStatus>(GraphStatus.Stopped);
  const {
    state: { surfaceMode },
  } = useProject();

  useEffect(() => {
    return window.lights.onEvent((event) => {
      if (event.type === 'graph:status') setStatus(event.status);
    });
  }, []);

  // *Claude* : Should slide panel be visible in surface mode ?
  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {surfaceMode ? (
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
  );
}

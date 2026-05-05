import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import {
  Canvas,
  LayerToolbar,
  SlidePanel,
  StageOverlay,
  SurfaceCanvas,
  SurfacePanel,
  VolumeAlignHUD,
  VolumeEditor,
} from './components';
import { useGraph, useProject } from './model';

export default function App() {
  const { status } = useGraph();
  const {
    state: { editorMode },
  } = useProject();
  const [showVideo, setShowVideo] = useState(true);

  // *Claude* : Should slide panel be visible in surface mode ?
  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {editorMode === 'volume-editor' ? (
          <VolumeEditor />
        ) : editorMode === 'surface' ? (
          <SurfaceCanvas />
        ) : (
          <div className="stage-canvas">
            <Canvas showVideo={showVideo} />
            {editorMode === 'volume-align' ? <VolumeAlignHUD /> : <StageOverlay />}
          </div>
        )}
        {editorMode === 'stage' && (
          <button
            className={`canvas-video-toggle${showVideo ? '' : ' off'}`}
            title={showVideo ? 'Hide video' : 'Show video'}
            onClick={() => setShowVideo((v) => !v)}
          >
            {showVideo ? (
              <Square size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
          </button>
        )}
        <span className="status">{status}</span>
      </div>
      <LayerToolbar />
      <SurfacePanel />
    </div>
  );
}

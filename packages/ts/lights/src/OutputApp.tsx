import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Slide } from './model/types';
import { buildSurfaceMesh, buildLiveSurfaceMesh, disposeSurfaceMesh, preloadSurfaces, buildShapeMesh, disposeShapeMesh } from '@lights/three-scene';
import type { DrawDetectionLayer } from '@lights/three-scene';
import { createRenderer } from './detectionCanvas';
import type { DetectionCanvasRenderer } from './detectionCanvas';
import { decodeTypedDetection } from './ipc';

interface LiveEntry {
  recomposite: (dt: number) => void
  renderers: Map<string, DetectionCanvasRenderer>
}

export default function OutputApp() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);

    // ── Flat surface pass (orthographic) ─────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const surfaceGroup = new THREE.Group();
    scene.add(surfaceGroup);

    // ── Volume pass (perspective) ─────────────────────────────────────────────
    const volumeScene = new THREE.Scene();
    const volumeCamera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    const volumeGroup = new THREE.Group();
    volumeScene.add(volumeGroup);

    // ── Live surface tracking ─────────────────────────────────────────────────
    const liveSurfaces = new Map<string, LiveEntry>();
    let lastDetectionTime = performance.now();

    function render() {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(volumeScene, volumeCamera);
    }

    function clearLiveSurfaces() {
      for (const { renderers } of liveSurfaces.values()) {
        for (const r of renderers.values()) r.dispose();
      }
      liveSurfaces.clear();
    }

    async function renderSlide(slide: Slide) {
      // Surfaces
      clearLiveSurfaces();
      surfaceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      surfaceGroup.clear();

      await preloadSurfaces(slide.surfaces);

      slide.surfaces.forEach((surface, i) => {
        const hasLive = surface.layers.some(l => l.type === 'detectionCanvas' && l.visible);
        if (!hasLive) {
          surfaceGroup.add(buildSurfaceMesh(surface, i));
          return;
        }
        const renderers = new Map<string, DetectionCanvasRenderer>();
        for (const layer of surface.layers) {
          if (layer.type !== 'detectionCanvas' || !layer.visible) continue;
          const r = createRenderer(layer.rendererId, layer.params);
          if (r) renderers.set(layer.id, r);
        }
        const drawFn: DrawDetectionLayer = (ctx, layerId, transform, w, h, dt) => {
          renderers.get(layerId)?.render(ctx, w, h, transform, dt);
        };
        const { mesh, recomposite } = buildLiveSurfaceMesh(surface, i, drawFn);
        surfaceGroup.add(mesh);
        liveSurfaces.set(surface.id, { recomposite, renderers });
      });

      // Volume
      volumeGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeShapeMesh(child as THREE.Mesh);
      });
      volumeGroup.clear();

      if (slide.volume) {
        const { position: p, target: t, fov } = slide.volume.camera;
        volumeCamera.position.set(p.x, p.y, p.z);
        volumeCamera.lookAt(t.x, t.y, t.z);
        volumeCamera.fov = fov;
        volumeCamera.updateProjectionMatrix();
        for (const shape of slide.volume.shapes) volumeGroup.add(buildShapeMesh(shape));
      }

      render();
    }

    const offSlide = window.lights.onOutputRender((data) => {
      renderSlide(data as Slide);
    });

    // Route detection events to live surface renderers
    const offEvent = window.lights.onEvent((event) => {
      if (event.type !== 'detection') return;
      const typed = decodeTypedDetection(event.moduleId, event.position, event.data);
      if (!typed || liveSurfaces.size === 0) return;
      const now = performance.now();
      const dt = now - lastDetectionTime;
      lastDetectionTime = now;
      for (const { renderers, recomposite } of liveSurfaces.values()) {
        for (const r of renderers.values()) r.onDetection(typed);
        recomposite(dt);
      }
      render();
    });

    function updateLayout() {
      const { clientWidth: w, clientHeight: h } = container;
      renderer.setSize(w, h);
      volumeCamera.aspect = w / h;
      volumeCamera.updateProjectionMatrix();
      render();
    }

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    updateLayout();

    return () => {
      offSlide();
      offEvent();
      observer.disconnect();
      clearLiveSurfaces();
      surfaceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      volumeGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeShapeMesh(child as THREE.Mesh);
      });
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#000',
      }}
    />
  );
}

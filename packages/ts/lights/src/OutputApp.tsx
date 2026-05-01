import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Slide } from './model/types';
import { buildSurfaceMesh, disposeSurfaceMesh } from './shaders/homography';

export default function OutputApp() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const surfaceGroup = new THREE.Group();
    scene.add(surfaceGroup);

    function render() {
      renderer.render(scene, camera);
    }

    function renderSlide(slide: Slide) {
      surfaceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      surfaceGroup.clear();
      slide.surfaces.forEach((surface, i) => {
        // Skip surfaces with no visible layers — checkerboard stays editor-only
        if (surface.layers.some((l) => l.visible)) {
          surfaceGroup.add(buildSurfaceMesh(surface, i));
        }
      });
      render();
    }

    const off = window.lights.onOutputRender((data) =>
      renderSlide(data as Slide),
    );

    function updateLayout() {
      const { clientWidth: w, clientHeight: h } = container;
      renderer.setSize(w, h);
      render();
    }

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);
    updateLayout();

    return () => {
      off();
      observer.disconnect();
      surfaceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
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

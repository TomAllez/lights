import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Slide } from './model/types';
import { buildSurfaceMesh, disposeSurfaceMesh, preloadSurfaces, buildShapeMesh, disposeShapeMesh } from '@lights/three-scene';

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

    function render() {
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(volumeScene, volumeCamera);
    }

    async function renderSlide(slide: Slide) {
      // Surfaces
      surfaceGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      surfaceGroup.clear();
      await preloadSurfaces(slide.surfaces);
      slide.surfaces.forEach((surface, i) => surfaceGroup.add(buildSurfaceMesh(surface, i)));

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

    const off = window.lights.onOutputRender((data) => {
      renderSlide(data as Slide);
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
      off();
      observer.disconnect();
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

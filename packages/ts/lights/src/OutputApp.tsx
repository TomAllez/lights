import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Slide } from './model/types';
import { buildSurfaceMesh, disposeSurfaceMesh, preloadSurfaces, buildShapeMesh, disposeShapeMesh, buildShaderLayerMeshes, disposeShaderLayerMesh } from '@lights/three-scene';

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
    const shaderGroup = new THREE.Group();
    scene.add(shaderGroup);

    // rAF loop for ShaderLayer uTime animation, throttled to 30 fps
    const SHADER_FRAME_MS = 1000 / 30;
    let animId: number | null = null;
    let lastShaderRender = 0;
    const t0 = performance.now();
    function tick(timestamp: number) {
      animId = requestAnimationFrame(tick);
      if (timestamp - lastShaderRender < SHADER_FRAME_MS) return;
      lastShaderRender = timestamp;
      const t = (performance.now() - t0) / 1000;
      shaderGroup.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.ShaderMaterial;
        if (mat.uniforms?.uTime) mat.uniforms.uTime.value = t;
      });
      render();
    }

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
      surfaceGroup.traverse((child) => { if (child instanceof THREE.Mesh) disposeSurfaceMesh(child); });
      surfaceGroup.clear();
      shaderGroup.traverse((obj) => { if (obj instanceof THREE.Mesh) disposeShaderLayerMesh(obj); });
      shaderGroup.clear();

      await preloadSurfaces(slide.surfaces);
      slide.surfaces.forEach((surface, i) => surfaceGroup.add(buildSurfaceMesh(surface, i)));
      for (const surface of slide.surfaces) {
        for (const mesh of buildShaderLayerMeshes(surface)) shaderGroup.add(mesh);
      }

      // Volume
      volumeGroup.traverse((child) => { if (child instanceof THREE.Mesh) disposeShapeMesh(child as THREE.Mesh); });
      volumeGroup.clear();

      if (slide.volume) {
        const { position: p, target: t, fov } = slide.volume.camera;
        volumeCamera.position.set(p.x, p.y, p.z);
        volumeCamera.lookAt(t.x, t.y, t.z);
        volumeCamera.fov = fov;
        volumeCamera.updateProjectionMatrix();
        for (const shape of slide.volume.shapes) volumeGroup.add(buildShapeMesh(shape));
      }

      const hasShaders = slide.surfaces.some(s => s.layers.some(l => l.type === 'shader' && l.visible));
      if (hasShaders && animId === null) animId = requestAnimationFrame(tick);
      else if (!hasShaders && animId !== null) { cancelAnimationFrame(animId); animId = null; render(); }
      else if (!hasShaders) render();
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
      if (animId !== null) cancelAnimationFrame(animId);
      off();
      observer.disconnect();
      surfaceGroup.traverse((child) => { if (child instanceof THREE.Mesh) disposeSurfaceMesh(child); });
      shaderGroup.traverse((obj) => { if (obj instanceof THREE.Mesh) disposeShaderLayerMesh(obj); });
      volumeGroup.traverse((child) => { if (child instanceof THREE.Mesh) disposeShapeMesh(child as THREE.Mesh); });
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

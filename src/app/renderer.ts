import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';

export function createRenderer() {
  const renderer = new WebGPURenderer({
    antialias: true,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  return renderer;
}

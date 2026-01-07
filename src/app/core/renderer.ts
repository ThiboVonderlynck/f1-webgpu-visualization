import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';

export function createRenderer() {
  const renderer = new WebGPURenderer({
    antialias: true,
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const app = document.getElementById('app');
  if (app) {
    app.appendChild(renderer.domElement);
  } else {
    document.body.appendChild(renderer.domElement);
  }

  return renderer;
}

import type { WebGPURenderer } from 'three/src/renderers/webgpu/WebGPURenderer.js';
import type { Scene } from 'three';
import type { PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function startAnimationLoop(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  controls: OrbitControls
): void {
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
}


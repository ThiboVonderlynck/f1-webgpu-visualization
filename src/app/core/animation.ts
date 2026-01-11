import type WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js';
import type { Scene } from 'three';
import type { PerspectiveCamera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { UpdateCallback } from '../../types';

export type { UpdateCallback };

export function startAnimationLoop(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, controls: OrbitControls, onUpdate?: UpdateCallback): void {
  let previousTime = 0;

  function animate(time: number) {
    requestAnimationFrame(animate);

    const deltaTime = (time - previousTime) / 1000;
    previousTime = time;

    controls.update();

    if (onUpdate) {
      onUpdate(deltaTime);
    }

    renderer.render(scene, camera);
  }

  animate(0);
}

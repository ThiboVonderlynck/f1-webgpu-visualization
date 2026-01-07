import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer } from './app/core/renderer.js';
import { createScene, addGridHelper } from './app/core/scene.js';
import { createCamera, createControls, setupCameraResize } from './app/core/camera.js';
import { addLights } from './app/core/lights.js';
import { CircuitManager } from './app/circuit/circuitManager.js';
import { setupCircuitSelector } from './app/ui/circuitSelector.js';
import { startAnimationLoop } from './app/core/animation.js';
import { getDefaultCircuit } from './app/circuit/circuitDiscovery.js';

async function init() {
  checkWebGPUSupport();

  const renderer = createRenderer();
  await renderer.init();

  const scene = createScene();
  addGridHelper(scene);

  const camera = createCamera();
  const controls = createControls(camera, renderer.domElement);
  setupCameraResize(camera);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  addLights(scene);

  const circuitManager = new CircuitManager(scene, camera, controls);
  const defaultCircuit = getDefaultCircuit();

  setupCircuitSelector((circuitFile) => {
    circuitManager.loadCircuit(circuitFile).catch(console.error);
  }, defaultCircuit);

  await circuitManager.loadCircuit(defaultCircuit);
  startAnimationLoop(renderer, scene, camera, controls);
}

// Start the application
init().catch((error) => {
  console.error('Failed to initialize application:', error);
  document.body.innerHTML = `
    <p>Failed to initialize application: ${error.message}</p>
  `;
});

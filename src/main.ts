import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer, createScene, addGridHelper, createCamera, createControls, setupCameraResize, addLights, startAnimationLoop } from './app/core';
import { CircuitManager, getDefaultCircuit } from './app/circuit';
import { CarManager } from './app/cars';
import { setupCircuitSelector } from './app/ui/circuitSelector.js';
import GUI from 'lil-gui';

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

  // Create GUI
  const gui = new GUI();
  gui.title('F1 Circuit Controls');

  const circuitManager = new CircuitManager(scene, camera, controls);
  const carManager = new CarManager(scene, gui);
  const defaultCircuit = getDefaultCircuit();

  setupCircuitSelector(async (circuitFile) => {
    await circuitManager.loadCircuit(circuitFile);

    // Extract circuit name from filename (remove extension and path)
    const circuitName = circuitFile.filename.replace('generated/', '').replace(/\.(stl|3mf)$/, '');

    // Load racing line for the circuit with same rotation
    try {
      await carManager.loadRacingLine(circuitName, circuitFile.rotation);
    } catch (error) {
      console.warn(`Racing line not found for ${circuitName}:`, error);
    }
  }, defaultCircuit);

  await circuitManager.loadCircuit(defaultCircuit);

  // Load racing line for default circuit with same rotation
  const defaultCircuitName = defaultCircuit.filename.replace('generated/', '').replace(/\.(stl|3mf)$/, '');

  try {
    await carManager.loadRacingLine(defaultCircuitName, defaultCircuit.rotation);
  } catch (error) {
    console.warn(`Racing line not found for ${defaultCircuitName}:`, error);
  }

  // Start animation loop with car updates
  startAnimationLoop(renderer, scene, camera, controls, (deltaTime) => {
    carManager.update(deltaTime);
  });
}

// Start the application
init().catch((error) => {
  console.error('Failed to initialize application:', error);
  document.body.innerHTML = `
    <p>Failed to initialize application: ${error.message}</p>
  `;
});

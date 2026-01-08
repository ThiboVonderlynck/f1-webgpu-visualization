import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer, createScene, addGridHelper, createCamera, createControls, setupCameraResize, addLights, startAnimationLoop } from './app/core';
import { CircuitManager, getDefaultCircuit } from './app/circuit';
import { CarManager } from './app/cars';
import { setupCircuitSelector } from './app/ui/circuitSelector.js';
import { DataFetcher } from './app/ui/DataFetcher.js';
import GUI from 'lil-gui';
import './styles/dataFetcher.css';

async function initVisualization(selectedRound?: number) {
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

  // Determine which circuit to load
  let circuitToLoad = getDefaultCircuit();

  if (selectedRound) {
    const circuitFilename = DataFetcher.getCircuitForRound(selectedRound);
    if (circuitFilename) {
      circuitToLoad = {
        displayName: circuitFilename.replace('.stl', ''),
        filename: `generated/${circuitFilename}`,
        format: 'stl' as const,
        rotation: 0,
      };
    }
  }

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
  }, circuitToLoad);

  await circuitManager.loadCircuit(circuitToLoad);

  // Load racing line for selected circuit with same rotation
  const circuitName = circuitToLoad.filename.replace('generated/', '').replace(/\.(stl|3mf)$/, '');

  try {
    await carManager.loadRacingLine(circuitName, circuitToLoad.rotation);
  } catch (error) {
    console.warn(`Racing line not found for ${circuitName}:`, error);
  }

  // Start animation loop with car updates
  startAnimationLoop(renderer, scene, camera, controls, (deltaTime) => {
    carManager.update(deltaTime);
  });
}

// Show Data Fetcher first
function init() {
  const fetcherContainer = document.createElement('div');
  document.body.appendChild(fetcherContainer);

  new DataFetcher(fetcherContainer, (year: number, round: number, sessionType: string) => {
    // Callback: start visualization after data is fetched with the selected round
    console.log(`Data fetched for ${year} Round ${round} - ${sessionType}`);
    initVisualization(round).catch((error) => {
      console.error('Failed to initialize visualization:', error);
      document.body.innerHTML = `
        <p>Failed to initialize visualization: ${error.message}</p>
      `;
    });
  });
}

// Start the application
init();

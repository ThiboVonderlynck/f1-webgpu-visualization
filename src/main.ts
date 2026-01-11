import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer, createScene, addGridHelper, createCamera, createControls, setupCameraResize, addLights, startAnimationLoop } from './app/core/index.js';
import { CircuitManager, getDefaultCircuit } from './app/circuit/index.js';
import { CarManager } from './app/cars/index.js';
import { setupCircuitSelector } from './app/ui/CircuitSelector.js';
import { DataFetcher } from './app/ui/DataFetcher.js';
import { getCircuitForRound } from './config/index.js';
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

  const gui = new GUI();
  gui.title('F1 Circuit Controls');

  const circuitManager = new CircuitManager(scene, camera, controls);
  const carManager = new CarManager(scene, gui);

  let circuitToLoad = getDefaultCircuit();

  if (selectedRound) {
    const circuitFilename = getCircuitForRound(selectedRound);
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

    const circuitName = circuitFile.filename.replace('generated/', '').replace(/\.(stl|3mf)$/, '');

    try {
      await carManager.loadRacingLine(circuitName, circuitFile.rotation);
    } catch (error) {
      console.warn(`Racing line not found for ${circuitName}:`, error);
    }
  }, circuitToLoad);

  await circuitManager.loadCircuit(circuitToLoad);

  const circuitName = circuitToLoad.filename.replace('generated/', '').replace(/\.(stl|3mf)$/, '');

  try {
    await carManager.loadRacingLine(circuitName, circuitToLoad.rotation);
  } catch (error) {
    console.warn(`Racing line not found for ${circuitName}:`, error);
  }

  startAnimationLoop(renderer, scene, camera, controls, (deltaTime: number) => {
    carManager.update(deltaTime);
  });
}

function init() {
  const storedSelection = sessionStorage.getItem('f1Selection');

  if (storedSelection) {
    try {
      const selection = JSON.parse(storedSelection);
      console.log('Found stored selection:', selection);

      sessionStorage.removeItem('f1Selection');

      initVisualization(selection.round).catch((error) => {
        console.error('Failed to initialize visualization:', error);
        document.body.innerHTML = `
          <p>Failed to initialize visualization: ${error.message}</p>
        `;
      });
      return;
    } catch (error) {
      console.error('Error parsing stored selection:', error);
    }
  }

  const fetcherContainer = document.createElement('div');
  document.body.appendChild(fetcherContainer);

  new DataFetcher(fetcherContainer, (year: number, round: number, sessionType: string) => {
    console.log(`Data fetched for ${year} Round ${round} - ${sessionType}`);
    initVisualization(round).catch((error) => {
      console.error('Failed to initialize visualization:', error);
      document.body.innerHTML = `
        <p>Failed to initialize visualization: ${error.message}</p>
      `;
    });
  });
}

init();

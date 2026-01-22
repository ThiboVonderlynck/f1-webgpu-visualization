import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer, createScene, createCamera, createControls, setupCameraResize, addLights, startAnimationLoop } from './app/core';
import { CircuitManager } from './app/circuit';
import { DataFetcher } from './app/ui/DataFetcher.js';
import { Leaderboard } from './app/ui/Leaderboard.js';
import { WeatherWidget } from './app/ui/WeatherWidget.js';
import { POVOverlay } from './app/ui/POVOverlay.js';
import { WebSocketClient, PlaybackController, PlaybackUI, CarRenderer } from './app/playback';
import { POVCamera } from './app/camera/POVCamera';
import { setDriverTeams } from './app/ui/teamMapping.js';
import type { TrackData } from './app/circuit/trackRenderer.js';
import './styles/dataFetcher.css';
import './styles/playbackUI.css';
import './styles/leaderboard.css';
import './styles/weather.css';
import './styles/qualifying.css';

async function initVisualization(trackData: TrackData) {
  // Create loading overlay FIRST (before anything else) so it's visible immediately
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'model-loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">Initializing 3D engine...</div>
    </div>
  `;
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    transition: opacity 0.5s ease;
  `;
  const loadingContent = `
    <style>
      #model-loading-overlay .loading-content {
        text-align: center;
        color: white;
      }
      #model-loading-overlay .loading-spinner {
        width: 60px;
        height: 60px;
        margin: 0 auto 20px;
        border: 4px solid rgba(255, 255, 255, 0.2);
        border-top-color: #e10600;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      #model-loading-overlay .loading-text {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 1px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  loadingOverlay.insertAdjacentHTML('beforeend', loadingContent);
  document.body.appendChild(loadingOverlay);

  // Now check WebGPU support (after overlay is visible)
  checkWebGPUSupport();

  // Helper to update loading text
  const updateLoadingText = (text: string) => {
    const textEl = loadingOverlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
  };

  updateLoadingText('Initializing 3D engine...');
  const renderer = createRenderer();
  await renderer.init();

  const scene = createScene();

  const camera = createCamera();
  const controls = createControls(camera, renderer.domElement);
  setupCameraResize(camera);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  addLights(scene);

  updateLoadingText('Loading track...');
  const circuitManager = new CircuitManager(scene, camera, controls);
  if (trackData) {
    await circuitManager.loadTrackFromTelemetry(trackData);
  }

  updateLoadingText('Connecting to server...');
  const wsClient = new WebSocketClient(import.meta.env.VITE_WS_URL || 'ws://localhost:3001');
  
  // Make wsClient globally accessible for DataFetcher logging
  (window as any).wsClient = wsClient;
  const playbackController = new PlaybackController();
  const carRenderer = new CarRenderer(scene);
  const povCamera = new POVCamera(camera);
  
  const uiOverlayContainer = document.createElement('div');
  document.body.appendChild(uiOverlayContainer);
  const povOverlay = new POVOverlay(uiOverlayContainer);

  const playbackContainer = document.createElement('div');
  document.body.appendChild(playbackContainer);
  new PlaybackUI(playbackContainer, playbackController, wsClient);

  const leaderboardContainer = document.createElement('div');
  document.body.appendChild(leaderboardContainer);
  const leaderboard = new Leaderboard(leaderboardContainer);

  if (trackData && trackData.centerline) {
    leaderboard.setTrackCenterline(trackData.centerline);
  }

  // Weather widget
  const weatherContainer = document.createElement('div');
  document.body.appendChild(weatherContainer);
  const weatherWidget = new WeatherWidget(weatherContainer);
  // Track if cars are ready - queue frames until then
  let carsReady = false;
  let pendingFrame: any = null;

  wsClient.onMetadata(async (metadata) => {
    console.log('📊 Received metadata:', metadata);
    updateLoadingText('Loading 3D car models...');
    playbackController.setTotalFrames(metadata.totalFrames);
    await carRenderer.initializeCars(metadata);
    leaderboard.setDriverColors(metadata.driverColors);
    leaderboard.setTotalLaps(metadata.totalLaps || 0);
    
    // Set dynamic driver-to-team mapping
    if (metadata.driverTeams) {
      setDriverTeams(metadata.driverTeams);
      leaderboard.resetEntries(); // Force re-render with team logos
    }

    // Handle qualifying mode (both regular Q and Sprint SQ)
    if ((metadata.sessionType === 'Q' || metadata.sessionType === 'SQ') && metadata.qualifying) {
      const isSprint = metadata.sessionType === 'SQ';
      console.log(`🏁 ${isSprint ? 'Sprint ' : ''}Qualifying session detected - enabling qualifying mode`);
      leaderboard.setQualifyingData(metadata.qualifying, isSprint);
    } else {
      // Ensure race mode for non-qualifying sessions
      leaderboard.setSessionMode('race');
    }

    // Cars are now ready - apply any pending frame
    carsReady = true;
    if (pendingFrame) {
      console.log('📍 Applying pending first frame to position cars');
      carRenderer.updatePositions(pendingFrame);
      leaderboard.updateFromFrame(pendingFrame);
      weatherWidget.updateFromFrame(pendingFrame);
      pendingFrame = null;
    }

    // Fade out loading overlay
    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.remove(), 500);
  });

  wsClient.onFrame((frame) => {
    if (!carsReady) {
      // Queue first frame until cars are initialized
      pendingFrame = frame;
      return;
    }
    carRenderer.updatePositions(frame);
    leaderboard.updateFromFrame(frame);
    weatherWidget.updateFromFrame(frame);
    
    // Hide out drivers' cars (DNF in race, eliminated in qualifying)
    const outDrivers = leaderboard.getOutDrivers();
    if (outDrivers.size > 0) {
      carRenderer.setEliminatedDrivers(outDrivers);
    } else {
      carRenderer.showAllCars();
    }
    
    if (povCamera.getIsActive()) {
      povOverlay.update(frame);
    }

    const frameNumber = frame.frameNumber ?? Math.floor(frame.t * 25);
    playbackController.updateFrame(frameNumber);
  });

  wsClient.onConnected(() => {
    console.log('✅ WebSocket connected - ready for playback');
  });

  wsClient.onDisconnected(() => {
    console.warn('⚠️ WebSocket disconnected');
  });

  try {
    await wsClient.connect();
  } catch (error) {
    console.error('Failed to connect to WebSocket server:', error);
    alert('Failed to connect to streaming server. Make sure the Node.js server is running on port 3001.');
  }

  // Leaderboard driver selection for POV
  leaderboard.onDriverSelect((code) => {
    const car = carRenderer.getCar(code);
    const mount = carRenderer.getCameraMount(code);
    if (car) {
      console.log(`🎥 Switching to POV view for: ${code}`);
      povCamera.setTarget(car, mount);
      povCamera.activate();
      povOverlay.show(code);
      leaderboard.setSelectedDriver(code);
      controls.enabled = false; // Disable orbit controls in POV
    }
  });

  // ESC to exit POV
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && povCamera.getIsActive()) {
      console.log('🎥 Exiting POV view');
      povCamera.deactivate();
      povOverlay.hide();
      leaderboard.setSelectedDriver(null);
      controls.enabled = true; // Re-enable orbit controls
    }
  });

  startAnimationLoop(renderer, scene, camera, controls, () => {
    if (povCamera.getIsActive()) {
      povCamera.update();
    }
  });
}

function init() {
  const fetcherContainer = document.createElement('div');
  document.body.appendChild(fetcherContainer);

  new DataFetcher(fetcherContainer, async (year: number, round: number, sessionType: string, trackData: TrackData) => {
    console.log(`✅ Data fetched for ${year} Round ${round} - ${sessionType}`);

    if (!trackData) {
      console.error('❌ No track data received from backend');
      return;
    }

    try {
      await initVisualization(trackData);
    } catch (error) {
      console.error('Failed to initialize visualization:', error);
      document.body.innerHTML = `
        <div style="padding: 20px; color: red;">
          <h2>❌ Failed to initialize visualization</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  });
}

init();

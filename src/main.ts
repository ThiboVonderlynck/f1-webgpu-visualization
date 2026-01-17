import { checkWebGPUSupport } from './utils/webgpuCheck.js';
import { createRenderer, createScene, createCamera, createControls, setupCameraResize, addLights, startAnimationLoop } from './app/core';
import { CircuitManager } from './app/circuit';
import { DataFetcher } from './app/ui/DataFetcher.js';
import { Leaderboard } from './app/ui/Leaderboard.js';
import { WeatherWidget } from './app/ui/WeatherWidget.js';
import { WebSocketClient, PlaybackController, PlaybackUI, CarRenderer } from './app/playback';
import { setDriverTeams } from './app/ui/teamMapping.js';
import type { TrackData } from './app/circuit/trackRenderer.js';
import './styles/dataFetcher.css';
import './styles/playbackUI.css';
import './styles/leaderboard.css';
import './styles/weather.css';

async function initVisualization(trackData: TrackData) {
  checkWebGPUSupport();

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

  const circuitManager = new CircuitManager(scene, camera, controls);
  if (trackData) {
    await circuitManager.loadTrackFromTelemetry(trackData);
    console.log('✅ Track loaded from telemetry');
  } else {
    console.warn('⚠️ No track data provided');
  }

  const wsClient = new WebSocketClient('ws://localhost:3001');
  const playbackController = new PlaybackController();
  const carRenderer = new CarRenderer(scene);

  const playbackContainer = document.createElement('div');
  document.body.appendChild(playbackContainer);
  const playbackUI = new PlaybackUI(playbackContainer, playbackController, wsClient);

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

  // Create loading overlay for model loading
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'model-loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading 3D models...</div>
    </div>
  `;
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
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

  // Track if cars are ready - queue frames until then
  let carsReady = false;
  let pendingFrame: any = null;

  wsClient.onMetadata(async (metadata) => {
    console.log('📊 Received metadata:', metadata);
    playbackController.setTotalFrames(metadata.totalFrames);
    await carRenderer.initializeCars(metadata);
    leaderboard.setDriverColors(metadata.driverColors);
    leaderboard.setTotalLaps(metadata.totalLaps || 0);
    
    // Set dynamic driver-to-team mapping
    if (metadata.driverTeams) {
      setDriverTeams(metadata.driverTeams);
      leaderboard.resetEntries(); // Force re-render with team logos
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

  startAnimationLoop(renderer, scene, camera, controls, () => {});
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
      console.log('🏁 Visualization initialized - ready for playback!');
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

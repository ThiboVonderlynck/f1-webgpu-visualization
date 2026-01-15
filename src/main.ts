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

  wsClient.onMetadata((metadata) => {
    console.log('📊 Received metadata:', metadata);
    playbackController.setTotalFrames(metadata.totalFrames);
    carRenderer.initializeCars(metadata);
    leaderboard.setDriverColors(metadata.driverColors);
    leaderboard.setTotalLaps(metadata.totalLaps || 0);
    
    // Set dynamic driver-to-team mapping
    if (metadata.driverTeams) {
      setDriverTeams(metadata.driverTeams);
      leaderboard.resetEntries(); // Force re-render with team logos
    }
  });

  wsClient.onFrame((frame) => {
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

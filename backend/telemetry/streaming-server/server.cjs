#!/usr/bin/env node
/**
 * F1 Telemetry Streaming Server
 *
 * Purpose: Simulate real-time F1 race telemetry by streaming large historical JSON files
 *
 * Why streaming?
 * - JSON files can be 500MB-1GB+, too large to load into memory with JSON.parse()
 * - stream-json allows incremental processing, reading data piece-by-piece
 * - Minimal memory footprint regardless of file size
 *
 * Architecture:
 * - Reads JSON file incrementally using stream-json
 * - Buffers frames and sends them at configurable intervals via WebSocket
 * - Simulates "live" race by sending historical data as if it's happening now
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { pick } = require('stream-json/filters/Pick');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  PORT: 8080,
  // Interval between sending frames (ms)
  // 40ms = 25 FPS, 100ms = 10 FPS, 500ms = 2 FPS
  FRAME_INTERVAL: 100,

  // Playback speed multiplier (1.0 = real-time, 2.0 = 2x speed, 0.5 = slow-mo)
  PLAYBACK_SPEED: 1.0,

  // Path to telemetry data (relative to this file)
  DATA_DIR: '../../../public/data/telemetry',

  // Buffer size: how many frames to load ahead (prevents stream starvation)
  BUFFER_SIZE: 500,

  // FPS of the telemetry data (frames per second in the source data)
  // This is set by the Python script that generates the data
  SOURCE_FPS: 25,
};

// ============================================================================
// STREAMING STATE MANAGER
// ============================================================================

class RaceStreamManager {
  constructor(filePath, config) {
    this.filePath = filePath;
    this.config = config;
    this.clients = new Set();
    this.frames = [];
    this.metadata = null;
    // Metadata handling removed
    this.currentFrameIndex = 0;
    this.isPlaying = false;
    this.raceTimer = null; // Timer that advances race (always 25 FPS)
    this.broadcastTimer = null; // Timer that sends updates at interval
    this.streamComplete = false;
    this.isLoadingStream = false;
  }

  /**
   * Load telemetry data incrementally using streaming JSON parser
   * This is the core streaming logic - no JSON.parse() on full file!
   */
  async loadTelemetryStream() {
    if (this.isLoadingStream) {
      console.log('[Stream] Already loading, skipping duplicate request');
      return;
    }

    this.isLoadingStream = true;
    console.log(`[Stream] Starting incremental load of: ${this.filePath}`);
    console.log(`[Stream] Using stream-json to avoid loading ${(fs.statSync(this.filePath).size / 1024 / 1024).toFixed(2)}MB into memory`);

    return new Promise((resolve, reject) => {
      // Step 1: Load metadata (small, can keep in memory)
      const metadataPipeline = chain([fs.createReadStream(this.filePath), parser(), pick({ filter: 'metadata' })]);

      let found = false;
      metadataPipeline.on('data', (data) => {
        // The first data.value should be the metadata object
        if (!found && data.value) {
          this.metadata = data.value;
          found = true;
        }
      });

      metadataPipeline.on('end', () => {
        if (!this.metadata) {
          this.metadata = {};
          console.warn('[Stream] Warning: No metadata found!');
        } else {
          console.log(`[Stream] Metadata loaded: ${this.metadata.eventName} ${this.metadata.year}`);
        }
        // Step 2: Stream frames array incrementally
        this.loadFramesStream().then(resolve).catch(reject);
      });

      metadataPipeline.on('error', (err) => {
        this.isLoadingStream = false;
        console.error('[Stream] Metadata error:', err);
        reject(err);
      });
    });
  }

  /**
   * Load frames array using streaming
   */
  async loadFramesStream() {
    return new Promise((resolve, reject) => {
      console.log('[Stream] Loading frames array...');

      const framesPipeline = chain([fs.createReadStream(this.filePath), parser(), pick({ filter: 'telemetry.frames' }), streamArray()]);

      let frameCount = 0;

      framesPipeline.on('data', (data) => {
        // data.value contains the complete frame object
        this.frames.push(data.value);
        frameCount++;

        if (frameCount % 1000 === 0) {
          console.log(`[Stream] Buffered ${frameCount} frames... (${(this.frames.length * 0.001).toFixed(1)}K)`);
        }
      });

      framesPipeline.on('end', () => {
        this.streamComplete = true;
        this.isLoadingStream = false;
        console.log(`[Stream] ✓ Completed! Total frames loaded: ${this.frames.length}`);
        console.log(`[Stream] Memory efficient: Processed ${(fs.statSync(this.filePath).size / 1024 / 1024).toFixed(2)}MB without full load`);
        resolve();
      });

      framesPipeline.on('error', (err) => {
        this.isLoadingStream = false;
        console.error('[Stream] Frames error:', err);
        reject(err);
      });
    });
  }

  /**
   * Alternative: Fast loader for NDJSON (newline-delimited JSON)
   * Use this if you convert your data to NDJSON format
   */
  async loadTelemetryNDJSON() {
    const { parser } = require('stream-json/jsonl/Parser');

    console.log(`[NDJSON] Loading from: ${this.filePath}`);

    return new Promise((resolve, reject) => {
      const pipeline = chain([fs.createReadStream(this.filePath), parser()]);

      let count = 0;
      pipeline.on('data', (data) => {
        this.frames.push(data.value);
        count++;
        if (count % 1000 === 0) {
          console.log(`[NDJSON] Loaded ${count} frames...`);
        }
      });

      pipeline.on('end', () => {
        this.streamComplete = true;
        console.log(`[NDJSON] ✓ Loaded ${this.frames.length} frames`);
        resolve();
      });

      pipeline.on('error', reject);
    });
  }

  /**
   * Start broadcasting frames to connected clients
   */
  startPlayback() {
    if (this.isPlaying) {
      console.log('[Playback] Already playing');
      return;
    }

    if (this.frames.length === 0) {
      console.log('[Playback] No frames loaded yet');
      return;
    }

    this.isPlaying = true;
    console.log(`[Playback] ▶ Starting from frame ${this.currentFrameIndex}/${this.frames.length}`);
    console.log(`[Playback] Race advancing at 25 FPS, broadcasting every ${this.config.FRAME_INTERVAL}ms`);

    // Race timer: advances the race at source FPS (25 FPS = every 40ms)
    const raceInterval = 1000 / this.config.SOURCE_FPS;
    this.raceTimer = setInterval(() => {
      if (this.currentFrameIndex >= this.frames.length - 1) {
        console.log('[Playback] ⏹ Reached end of race');
        this.stopPlayback();
        this.broadcastToClients({ type: 'raceEnd' });
        return;
      }
      this.currentFrameIndex++;
    }, raceInterval);

    // Broadcast timer: sends current state at the configured interval
    this.broadcastTimer = setInterval(() => {
      if (this.currentFrameIndex >= this.frames.length) {
        return;
      }

      const frame = this.frames[this.currentFrameIndex];

      this.broadcastToClients({
        type: 'frame',
        frameIndex: this.currentFrameIndex,
        totalFrames: this.frames.length,
        data: frame,
      });

      // Progress updates
      if (this.currentFrameIndex % 250 === 0) {
        const progress = ((this.currentFrameIndex / this.frames.length) * 100).toFixed(1);
        console.log(`[Playback] Progress: ${progress}% (${this.currentFrameIndex}/${this.frames.length})`);
      }
    }, this.config.FRAME_INTERVAL);
  }

  /**
   * Pause playback
   */
  pausePlayback() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.raceTimer) {
      clearInterval(this.raceTimer);
      this.raceTimer = null;
    }
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    console.log(`[Playback] ⏸ Paused at frame ${this.currentFrameIndex}/${this.frames.length}`);
    // Only load frames, skip metadata entirely
    return this.loadFramesStream();
    const wasPlaying = this.isPlaying;
    this.pausePlayback();

    this.config.PLAYBACK_SPEED = Math.max(0.1, Math.min(speed, 10));
    console.log(`[Playback] Speed set to ${this.config.PLAYBACK_SPEED}x`);

    if (wasPlaying) {
      this.startPlayback();
    }
  }

  /**
   * Set frame interval (milliseconds between frames)
   */
  setFrameInterval(interval) {
    const wasPlaying = this.isPlaying;
    this.pausePlayback();

    this.config.FRAME_INTERVAL = Math.max(10, Math.min(interval, 10000));
    console.log(`[Playback] Interval set to ${this.config.FRAME_INTERVAL}ms`);

    if (wasPlaying) {
      this.startPlayback();
    }
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  broadcastToClients(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Add WebSocket client
   */
  addClient(ws) {
    this.clients.add(ws);
    console.log(`[Clients] Connected (${this.clients.size} total)`);

    // Send initial state
    ws.send(
      JSON.stringify({
        type: 'init',
        totalFrames: this.frames.length,
        currentFrame: this.currentFrameIndex,
        isPlaying: this.isPlaying,
        playbackSpeed: this.config.PLAYBACK_SPEED,
      })
    );
  }

  /**
   * Remove WebSocket client
   */
  removeClient(ws) {
    this.clients.delete(ws);
    console.log(`[Clients] Disconnected (${this.clients.size} remaining)`);
  }
}

// ============================================================================
// HTTP & WEBSOCKET SERVER
// ============================================================================

// Create HTTP server
const server = http.createServer((req, res) => {
  // Simple HTTP endpoint for health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        clients: streamManager ? streamManager.clients.size : 0,
        framesLoaded: streamManager ? streamManager.frames.length : 0,
      })
    );
    return;
  }

  // Default response
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head><title>F1 Telemetry Stream Server</title></head>
      <body>
        <h1>F1 Telemetry Streaming Server</h1>
        <p>WebSocket endpoint: <code>ws://localhost:${CONFIG.PORT}</code></p>
        <p>Health check: <a href="/health">/health</a></p>
        <h2>Commands (send via WebSocket):</h2>
        <ul>
          <li><code>{"command": "start"}</code> - Start race playback</li>
          <li><code>{"command": "pause"}</code> - Pause playback</li>
          <li><code>{"command": "stop"}</code> - Stop and reset</li>
          <li><code>{"command": "seek", "frame": 1000}</code> - Jump to frame</li>
          <li><code>{"command": "speed", "value": 2.0}</code> - Set playback speed</li>
        </ul>
      </body>
    </html>
  `);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

let streamManager = null;

// Handle WebSocket connections
wss.on('connection', (ws) => {
  if (!streamManager) {
    ws.send(JSON.stringify({ type: 'error', message: 'No race data loaded' }));
    ws.close();
    return;
  }

  streamManager.addClient(ws);

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.command) {
        case 'start':
          streamManager.startPlayback();
          break;
        case 'pause':
          streamManager.pausePlayback();
          break;
        case 'stop':
          streamManager.stopPlayback();
          break;
        case 'seek':
          if (typeof data.frame === 'number') {
            streamManager.seekToFrame(data.frame);
          }
          break;
        case 'speed':
          if (typeof data.value === 'number') {
            streamManager.setPlaybackSpeed(data.value);
          }
          break;
        case 'interval':
          if (typeof data.value === 'number') {
            streamManager.setFrameInterval(data.value);
          }
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
      }
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    streamManager.removeClient(ws);
  });
});

// ============================================================================
// STARTUP & FILE SELECTION
// ============================================================================

async function selectAndLoadRaceData() {
  const dataDir = path.join(__dirname, CONFIG.DATA_DIR);

  console.log('\n========================================');
  console.log('F1 Telemetry Streaming Server');
  console.log('========================================\n');

  // Find available telemetry files
  let files = [];
  try {
    const years = fs.readdirSync(dataDir).filter((f) => !f.startsWith('.'));

    for (const year of years) {
      const yearPath = path.join(dataDir, year);
      const yearFiles = fs
        .readdirSync(yearPath)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          path: path.join(yearPath, f),
          name: `${year}/${f}`,
          size: fs.statSync(path.join(yearPath, f)).size,
        }));
      files.push(...yearFiles);
    }
  } catch (err) {
    console.error('Error reading telemetry directory:', err.message);
    console.log(`Looking in: ${dataDir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No telemetry JSON files found!');
    console.log(`Please add files to: ${dataDir}`);
    process.exit(1);
  }

  // Show available files
  console.log('Available race data:');
  files.forEach((file, idx) => {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`  ${idx + 1}. ${file.name} (${sizeMB} MB)`);
  });
  console.log('');

  // For this prototype, just load the first file
  // In production, you could use readline to let user select
  const selectedFile = files[0];
  console.log(`[Loading] ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('');

  // Initialize stream manager
  streamManager = new RaceStreamManager(selectedFile.path, CONFIG);

  // Load data using streaming (this is the magic!)
  await streamManager.loadTelemetryStream();

  console.log('\n========================================');
  console.log(`✓ Server ready!`);
  console.log(`  WebSocket: ws://localhost:${CONFIG.PORT}`);
  console.log(`  HTTP: http://localhost:${CONFIG.PORT}`);
  console.log('========================================\n');
}

// Start the server
server.listen(CONFIG.PORT, () => {
  selectAndLoadRaceData().catch((err) => {
    console.error('Failed to load race data:', err);
    process.exit(1);
  });
});

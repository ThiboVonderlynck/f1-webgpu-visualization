#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { pick } = require('stream-json/filters/Pick');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  FRAME_INTERVAL: 100,
  PLAYBACK_SPEED: 1.0,
  SOURCE_FPS: 25,
};

class RaceStreamManager {
  constructor(filePath, config) {
    this.filePath = filePath;
    this.config = config;
    this.clients = new Set();
    this.frames = [];
    this.metadata = null;
    this.currentFrameIndex = 0;
    this.isPlaying = false;
    this.raceTimer = null;
    this.broadcastTimer = null;
    this.streamComplete = false;
    this.isLoadingStream = false;
    this.loadingProgress = {
      loaded: 0,
      total: null,
      percentage: 0,
    };
    this.logs = [];
  }

  log(message) {
    console.log(message);
    this.logs.push({ timestamp: new Date().toISOString(), message });
    if (this.logs.length > 100) this.logs.shift();
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }

  async loadTelemetryStream() {
    if (this.isLoadingStream) {
      this.log('[Stream] Already loading, skipping duplicate request');
      return;
    }

    this.isLoadingStream = true;
    this.frames = [];
    this.currentFrameIndex = 0;
    this.isPlaying = false;
    this.clearLogs();

    const fileSize = fs.statSync(this.filePath).size;
    this.log(`[Stream] Starting incremental load of: ${this.filePath}`);
    this.log(`[Stream] Using stream-json to avoid loading ${(fileSize / 1024 / 1024).toFixed(2)}MB into memory`);

    return new Promise((resolve, reject) => {
      const framesPipeline = chain([fs.createReadStream(this.filePath), parser(), pick({ filter: 'telemetry.frames' }), streamArray()]);

      let frameCount = 0;

      framesPipeline.on('data', (data) => {
        this.frames.push(data.value);
        frameCount++;

        if (frameCount % 10000 === 0) {
          this.log(`[Stream] Buffered ${frameCount.toLocaleString()} frames...`);
        }
      });

      framesPipeline.on('end', () => {
        this.streamComplete = true;
        this.isLoadingStream = false;
        this.loadingProgress.total = frameCount;
        this.loadingProgress.loaded = frameCount;
        this.loadingProgress.percentage = 100;
        this.log(`[Stream] ✓ Completed! Total frames loaded: ${frameCount.toLocaleString()}`);
        this.log(`[Stream] Memory efficient: Processed ${(fileSize / 1024 / 1024).toFixed(2)}MB without full load`);
        this.broadcastToClients({
          type: 'loaded',
          totalFrames: frameCount,
        });
        resolve();
      });

      framesPipeline.on('error', (err) => {
        this.isLoadingStream = false;
        console.error('[Stream] Frames error:', err);
        reject(err);
      });
    });
  }

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
    console.log(`[Playback] Race advancing at ${this.config.SOURCE_FPS} FPS, broadcasting every ${this.config.FRAME_INTERVAL}ms`);

    // Race timer: advances the race at source FPS
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

      if (this.currentFrameIndex % 250 === 0) {
        const progress = ((this.currentFrameIndex / this.frames.length) * 100).toFixed(1);
        console.log(`[Playback] Progress: ${progress}% (${this.currentFrameIndex}/${this.frames.length})`);
      }
    }, this.config.FRAME_INTERVAL);
  }

  stopPlayback() {
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
    console.log(`[Playback] ⏹ Stopped at frame ${this.currentFrameIndex}/${this.frames.length}`);
  }

  pausePlayback() {
    this.stopPlayback();
    console.log(`[Playback] ⏸ Paused at frame ${this.currentFrameIndex}/${this.frames.length}`);
  }

  seekToFrame(frameIndex) {
    const wasPlaying = this.isPlaying;
    this.stopPlayback();
    this.currentFrameIndex = Math.max(0, Math.min(frameIndex, this.frames.length - 1));
    console.log(`[Playback] Seeked to frame ${this.currentFrameIndex}/${this.frames.length}`);

    if (this.frames.length > 0) {
      const frame = this.frames[this.currentFrameIndex];
      this.broadcastToClients({
        type: 'frame',
        frameIndex: this.currentFrameIndex,
        totalFrames: this.frames.length,
        data: frame,
      });
    }

    if (wasPlaying) {
      this.startPlayback();
    }
  }

  setPlaybackSpeed(speed) {
    const wasPlaying = this.isPlaying;
    this.stopPlayback();
    this.config.PLAYBACK_SPEED = Math.max(0.1, Math.min(speed, 10));
    console.log(`[Playback] Speed set to ${this.config.PLAYBACK_SPEED}x`);
    if (wasPlaying) {
      this.startPlayback();
    }
  }

  broadcastToClients(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  addClient(ws) {
    this.clients.add(ws);
    console.log(`[Clients] Connected (${this.clients.size} total)`);

    ws.send(
      JSON.stringify({
        type: 'init',
        totalFrames: this.frames.length,
        currentFrame: this.currentFrameIndex,
        isPlaying: this.isPlaying,
        playbackSpeed: this.config.PLAYBACK_SPEED,
        loaded: this.streamComplete,
      })
    );
  }

  removeClient(ws) {
    this.clients.delete(ws);
    console.log(`[Clients] Disconnected (${this.clients.size} remaining)`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

let streamManager = null;

app.post('/api/fetch', async (req, res) => {
  const { year, round, sessionType = 'R' } = req.body;

  if (!year || !round) {
    return res.status(400).json({ error: 'Year and round are required' });
  }

  try {
    const scriptPath = path.join(__dirname, '../python/fetch_race_data.py');
    const pythonPath = process.env.PYTHON_PATH || 'python3';

    const command = `cd ${path.dirname(scriptPath)} && ${pythonPath} fetch_race_data.py ${year} ${round} ${sessionType}`;

    console.log(`[API] Executing: ${command}`);

    const child = exec(command);
    let output = '';

    child.stdout.on('data', (data) => {
      output += data;
      console.log(data);
    });

    child.stderr.on('data', (data) => {
      console.error(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          message: `Data fetched for ${year} Round ${round}`,
          output,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch data',
          output,
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/check/:year/:round/:sessionType', async (req, res) => {
  const { year, round, sessionType } = req.params;

  try {
    const dataDir = path.join(__dirname, '../../public/data/telemetry', year);
    const sessionSuffix = sessionType === 'Q' ? 'qualifying' : 'race';

    if (!fs.existsSync(dataDir)) {
      return res.json({ exists: false, path: null });
    }

    const files = fs.readdirSync(dataDir);
    const matchingFile = files.find((f) => f.includes(round.padStart(2, '0')) && f.includes(sessionSuffix) && f.endsWith('.json'));

    if (matchingFile) {
      const dataPath = path.join(dataDir, matchingFile);
      return res.json({
        exists: true,
        path: dataPath,
        filename: matchingFile,
      });
    }

    res.json({ exists: false, path: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/load/progress', (req, res) => {
  if (!streamManager) {
    return res.json({
      loading: false,
      progress: { loaded: 0, total: null, percentage: 0 },
      logs: [],
    });
  }

  res.json({
    loading: streamManager.isLoadingStream,
    progress: { ...streamManager.loadingProgress },
    logs: streamManager.getLogs(),
  });
});

// Load telemetry file for streaming
app.post('/api/load', async (req, res) => {
  const { year, round, sessionType = 'R' } = req.body;

  if (!year || !round) {
    return res.status(400).json({ error: 'Year and round are required' });
  }

  try {
    const dataDir = path.join(__dirname, '../../public/data/telemetry', String(year));
    const sessionSuffix = sessionType === 'Q' ? 'qualifying' : 'race';

    if (!fs.existsSync(dataDir)) {
      return res.status(404).json({ error: 'Data directory not found' });
    }

    const files = fs.readdirSync(dataDir);
    const matchingFile = files.find((f) => f.includes(String(round).padStart(2, '0')) && f.includes(sessionSuffix) && f.endsWith('.json'));

    if (!matchingFile) {
      return res.status(404).json({ error: 'Telemetry file not found' });
    }

    const filePath = path.join(dataDir, matchingFile);

    streamManager = new RaceStreamManager(filePath, CONFIG);

    streamManager.loadTelemetryStream().catch((err) => {
      console.error('[API] Background load error:', err);
    });

    res.json({
      success: true,
      message: `Loading telemetry: ${matchingFile}`,
      loading: true,
    });
  } catch (error) {
    console.error('[API] Error loading telemetry:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: streamManager ? streamManager.clients.size : 0,
    framesLoaded: streamManager ? streamManager.frames.length : 0,
    isPlaying: streamManager ? streamManager.isPlaying : false,
  });
});

const PORT = 3001;
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  if (!streamManager || streamManager.frames.length === 0) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'No race data loaded. Call POST /api/load first.',
      })
    );
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
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown command' }));
      }
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    if (streamManager) {
      streamManager.removeClient(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log('\n========================================');
  console.log('🏎️  F1 Unified Server');
  console.log('========================================');
  console.log(`✓ REST API: http://localhost:${PORT}`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log('  POST /api/fetch - Fetch race data');
  console.log('  GET  /api/check/:year/:round/:sessionType - Check if data exists');
  console.log('  POST /api/load - Load telemetry file for streaming');
  console.log('  GET  /health - Health check');
  console.log('\nWebSocket Commands:');
  console.log('  {"command": "start"} - Start playback');
  console.log('  {"command": "pause"} - Pause playback');
  console.log('  {"command": "stop"} - Stop playback');
  console.log('  {"command": "seek", "frame": 1000} - Jump to frame');
  console.log('  {"command": "speed", "value": 2.0} - Set playback speed');
  console.log('========================================\n');
});

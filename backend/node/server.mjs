#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync, readdirSync } from 'fs';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';

// Import CommonJS modules (stream-json is CommonJS)
const require = createRequire(import.meta.url);
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { streamObject } = require('stream-json/streamers/StreamObject');
const { pick } = require('stream-json/filters/Pick');
const { chain } = require('stream-chain');

const execPromise = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// ============================================================================
// REST API Endpoints (Unified - No Flask dependency required)
// ============================================================================

// Static years list - no Python needed
app.get('/api/years', (req, res) => {
  const years = [];
  for (let y = 2025; y >= 2018; y--) {
    years.push(y);
  }
  res.json({ success: true, years });
});

// Get races for a year - spawns Python on-demand
app.get('/api/races', async (req, res) => {
  const year = req.query.year;
  
  if (!year) {
    return res.status(400).json({
      success: false,
      error: 'Year parameter is required'
    });
  }

  try {
    console.log(`Fetching races for ${year}...`);
    
    const pythonScript = path.join(__dirname, '../python/get_races.py');
    const command = `python3 "${pythonScript}" ${year}`;
    
    const { stdout, stderr } = await execPromise(command, {
      timeout: 30000, // 30 second timeout
    });
    
    const result = JSON.parse(stdout);
    
    if (result.success) {
      console.log(`✓ Found ${result.races.length} races for ${year}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching races:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get sessions for a race - spawns Python on-demand
app.get('/api/sessions', async (req, res) => {
  const { year, round } = req.query;
  
  if (!year || !round) {
    return res.status(400).json({
      success: false,
      error: 'Year and round parameters are required'
    });
  }

  try {
    const pythonScript = path.join(__dirname, '../python/get_sessions.py');
    const command = `python3 "${pythonScript}" ${year} ${round}`;
    
    const { stdout } = await execPromise(command, {
      timeout: 30000,
    });
    
    const result = JSON.parse(stdout);
    res.json(result);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'F1 Unified Server',
    pythonMode: 'on-demand'
  });
});

app.get('/api/check/:year/:round/:sessionType', async (req, res) => {
  const { year, round, sessionType } = req.params;

  try {
    // Try to find the file by scanning the directory
    const telemetryDir = path.join(__dirname, '../../public/data/telemetry', String(year));

    if (!existsSync(telemetryDir)) {
      return res.json({
        success: true,
        exists: false,
        path: null,
      });
    }

    const files = readdirSync(telemetryDir);
    const sessionSuffix = sessionType === 'Q' ? 'qualifying' : sessionType === 'S' ? 'sprint' : 'race';
    const roundPrefix = String(round).padStart(2, '0');

    // Find file matching pattern: 01-*_race.json
    const matchingFile = files.find((f) => f.startsWith(roundPrefix) && f.endsWith(`_${sessionSuffix}.json`));

    if (matchingFile) {
      const fullPath = path.join(telemetryDir, matchingFile);
      res.json({
        success: true,
        exists: true,
        path: fullPath,
      });
    } else {
      res.json({
        success: true,
        exists: false,
        path: null,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/cached/:year', async (req, res) => {
  const { year } = req.params;

  try {
    const telemetryDir = path.join(__dirname, '../../public/data/telemetry', String(year));
    const cached = {};

    if (existsSync(telemetryDir)) {
      const files = readdirSync(telemetryDir);
      
      files.forEach(file => {
        const match = file.match(/^(\d+)-.*_(race|qualifying|sprint)\.json$/);
        if (match) {
          const round = parseInt(match[1], 10);
          const session = match[2] === 'race' ? 'R' : match[2] === 'qualifying' ? 'Q' : 'S';
          
          if (!cached[round]) cached[round] = [];
          cached[round].push(session);
        }
      });
    }

    res.json({ success: true, cached });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/fetch', async (req, res) => {
  const { year, round, sessionType = 'R' } = req.body;

  if (!year || !round) {
    return res.status(400).json({
      success: false,
      error: 'Year and round are required',
    });
  }

  try {
    console.log(`\nFetching F1 data: ${year} Round ${round} (${sessionType})`);

    const pythonScript = path.join(__dirname, '../python/fetch_race_data.py');
    const command = `python3 "${pythonScript}" ${year} ${round} ${sessionType}`;

    console.log(`Executing: ${command}`);

    const { stdout, stderr } = await execPromise(command, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      timeout: 600000, // 10 minutes timeout (processing 20 drivers with full telemetry takes time)
    });

    // Check for errors in stderr (but allow warnings)
    if (stderr && stderr.toLowerCase().includes('error:')) {
      console.error('Python stderr:', stderr);
      throw new Error(stderr);
    }

    console.log('✓ Data fetched successfully');

    // Parse the JSON output from Python script
    let fileInfo = null;
    const jsonMatch = stdout.match(/__OUTPUT_JSON__:(.*)/);
    if (jsonMatch) {
      fileInfo = JSON.parse(jsonMatch[1]);
      console.log(`File created: ${fileInfo.file}`);
      console.log(`Frames: ${fileInfo.frames}, Size: ${fileInfo.size_mb} MB`);
    }

    res.json({
      success: true,
      message: `Data fetched for ${year} Round ${round} - ${sessionType}`,
      fileInfo,
    });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/api/load', async (req, res) => {
  const { year, round, sessionType = 'R' } = req.body;

  if (!year || !round) {
    return res.status(400).json({
      success: false,
      error: 'Year and round are required',
    });
  }

  try {
    // Find the telemetry file by scanning directory
    const telemetryDir = path.join(__dirname, '../../public/data/telemetry', String(year));

    if (!existsSync(telemetryDir)) {
      return res.status(404).json({
        success: false,
        error: 'Telemetry directory not found. Please fetch the data first.',
      });
    }

    const files = readdirSync(telemetryDir);
    const sessionSuffix = sessionType === 'Q' ? 'qualifying' : sessionType === 'S' ? 'sprint' : 'race';
    const roundPrefix = String(round).padStart(2, '0');

    const matchingFile = files.find((f) => f.startsWith(roundPrefix) && f.endsWith(`_${sessionSuffix}.json`));

    if (!matchingFile) {
      return res.status(404).json({
        success: false,
        error: 'Telemetry file not found. Please fetch the data first.',
      });
    }

    const filePath = path.join(telemetryDir, matchingFile);
    console.log(`Loading telemetry: ${filePath}`);

    // Load JSON file - Reference solution uses pickle.load() which loads entire file
    // We do the same but with JSON (line 168 in reference: pickle.load(f))
    const { readFileSync } = await import('fs');
    const fileContent = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Validate structure
    if (!data.telemetry || !data.telemetry.frames) {
      throw new Error('Invalid telemetry data structure');
    }

    const frames = data.telemetry.frames;
    const driverColors = data.driver_colors || {};
    const totalLaps = data.total_laps || 0;
    const track = data.track || null; // Extract track data from telemetry JSON

    console.log(`✓ Loaded ${frames.length} frames into memory`);
    if (track) {
      console.log(`✓ Track data loaded: ${track.centerline?.x?.length || 0} points`);
    }

    // Store in global state for WebSocket streaming
    // Reference: line 432 returns {frames, driver_colors, track_statuses, total_laps}
    global.currentTelemetry = {
      frames,
      driverColors,
      totalLaps,
      track, // Include track data in global state
      metadata: { year, round, sessionType },
    };

    res.json({
      success: true,
      totalFrames: frames.length,
      drivers: Object.keys(driverColors),
      totalLaps,
      track, // Include track data in response
    });
  } catch (error) {
    console.error('Load error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// WebSocket Streaming
// ============================================================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Playback state
let playbackState = {
  isPlaying: false,
  currentFrame: 0,
  speed: 1.0,
  interval: null,
};

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  // Send initial state
  if (global.currentTelemetry) {
    ws.send(
      JSON.stringify({
        type: 'metadata',
        data: {
          totalFrames: global.currentTelemetry.frames.length,
          driverColors: global.currentTelemetry.driverColors,
          totalLaps: global.currentTelemetry.totalLaps,
        },
      })
    );

    // Send first frame immediately to position cars on starting grid
    if (global.currentTelemetry.frames.length > 0) {
      const firstFrame = global.currentTelemetry.frames[0];
      ws.send(
        JSON.stringify({
          type: 'frame',
          frameNumber: 0,
          data: firstFrame,
        })
      );
      console.log('✓ Sent initial frame (0) for car positioning');
    }
  } else {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'No telemetry loaded. Please load data first.',
      })
    );
  }

  // Handle client messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleCommand(data.command, data.value, ws);
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          message: error.message,
        })
      );
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

/**
 * Handle WebSocket commands
 * Reference: Playback controls pattern
 */
function handleCommand(command, value, ws) {
  if (!global.currentTelemetry) {
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'No telemetry loaded',
      })
    );
    return;
  }

  switch (command) {
    case 'start':
      startPlayback();
      break;

    case 'pause':
      pausePlayback();
      break;

    case 'stop':
      stopPlayback();
      break;

    case 'seek':
      if (typeof value === 'number') {
        seekToFrame(value);
      }
      break;

    case 'speed':
      if (typeof value === 'number') {
        setPlaybackSpeed(value);
      }
      break;

    default:
      ws.send(
        JSON.stringify({
          type: 'error',
          message: `Unknown command: ${command}`,
        })
      );
  }
}

function startPlayback() {
  if (playbackState.isPlaying) return;

  playbackState.isPlaying = true;
  console.log('Playback started');

  const fps = 25; // Reference: FPS = 25
  const frameInterval = 1000 / fps / playbackState.speed;

  playbackState.interval = setInterval(() => {
    if (!global.currentTelemetry) {
      stopPlayback();
      return;
    }

    const frame = global.currentTelemetry.frames[playbackState.currentFrame];

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(
          JSON.stringify({
            type: 'frame',
            frameNumber: playbackState.currentFrame,
            data: frame,
          })
        );
      }
    });

    playbackState.currentFrame++;

    // Loop back to start
    if (playbackState.currentFrame >= global.currentTelemetry.frames.length) {
      playbackState.currentFrame = 0;
    }
  }, frameInterval);
}

function pausePlayback() {
  playbackState.isPlaying = false;
  if (playbackState.interval) {
    clearInterval(playbackState.interval);
    playbackState.interval = null;
  }
  console.log('Playback paused');
}

function stopPlayback() {
  pausePlayback();
  playbackState.currentFrame = 0;
  console.log('Playback stopped');
}

function seekToFrame(frameNumber) {
  playbackState.currentFrame = Math.max(0, Math.min(frameNumber, global.currentTelemetry.frames.length - 1));
  console.log(`Seeked to frame ${playbackState.currentFrame}`);
}

function setPlaybackSpeed(speed) {
  playbackState.speed = Math.max(0.1, Math.min(speed, 5.0));
  console.log(`Playback speed set to ${playbackState.speed}x`);

  // Restart playback with new speed if playing
  if (playbackState.isPlaying) {
    pausePlayback();
    startPlayback();
  }
}

// ============================================================================
// Utility Functions (removed - now using directory scanning)
// ============================================================================

// ============================================================================
// Server Startup
// ============================================================================

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🏎️  F1 Unified Server (No Flask required!)');
  console.log('='.repeat(60));
  console.log(`HTTP Server: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log('\nREST Endpoints:');
  console.log('  GET  /api/years');
  console.log('  GET  /api/races?year=2024');
  console.log('  GET  /api/sessions?year=2024&round=1');
  console.log('  GET  /api/cached/:year');
  console.log('  GET  /api/check/:year/:round/:sessionType');
  console.log('  POST /api/fetch (body: {year, round, sessionType})');
  console.log('  POST /api/load (body: {year, round, sessionType})');
  console.log('  GET  /health');
  console.log('\nWebSocket Commands:');
  console.log('  start, pause, stop, seek, speed');
  console.log('\n💡 Python is spawned on-demand, no separate server needed!');
  console.log('='.repeat(60) + '\n');
});


# F1 Telemetry Streaming Server

A Node.js server that simulates real-time F1 telemetry by streaming large historical JSON datasets incrementally.

## Why Streaming?

Traditional approach (`JSON.parse()`) loads the entire file into memory:

```js
// ❌ BAD - Loads 642MB into RAM, can crash on large files
const data = JSON.parse(fs.readFileSync('huge-race.json'));
```

Our streaming approach processes data piece-by-piece:

```js
// ✅ GOOD - Processes 642MB with minimal memory footprint
const stream = fs.createReadStream('huge-race.json').pipe(parser()).pipe(streamArray());
```

## Installation

```bash
cd scripts/telemetry/streaming-server
npm install
```

## Usage

### Start the server

```bash
npm start
```

The server will:

1. Scan `public/data/telemetry/` for JSON files
2. Load the first available race using streaming
3. Start WebSocket server on `ws://localhost:8080`

### Connect from your frontend

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.onopen = () => {
  console.log('Connected to F1 telemetry stream');

  // Start the race
  ws.send(JSON.stringify({ command: 'start' }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'init':
      // Initial state: metadata, total frames, etc.
      console.log('Race loaded:', message.metadata);
      break;

    case 'frame':
      // Real-time telemetry frame
      updateCarPositions(message.data);
      break;

    case 'raceEnd':
      console.log('Race finished!');
      break;
  }
};
```

## WebSocket Commands

Send commands as JSON:

```javascript
// Start playback
ws.send(JSON.stringify({ command: 'start' }));

// Pause
ws.send(JSON.stringify({ command: 'pause' }));

// Stop and reset
ws.send(JSON.stringify({ command: 'stop' }));

// Jump to specific frame
ws.send(JSON.stringify({ command: 'seek', frame: 5000 }));

// Change playback speed (0.1x - 10x)
ws.send(JSON.stringify({ command: 'speed', value: 2.0 }));
```

## Configuration

Edit `server.js` CONFIG section:

```javascript
const CONFIG = {
  PORT: 8080,

  // Interval between frames (ms)
  // 40ms = 25 FPS, 100ms = 10 FPS, 500ms = 2 FPS
  FRAME_INTERVAL: 100,

  // Playback speed multiplier
  PLAYBACK_SPEED: 1.0,

  // Data directory (relative path)
  DATA_DIR: '../../../public/data/telemetry',

  // Frame buffer size
  BUFFER_SIZE: 500,
};
```

## Data Format

Expected JSON structure from `fetch_race_data.py`:

```json
{
  "metadata": {
    "year": 2024,
    "round": 1,
    "eventName": "Bahrain Grand Prix",
    "sessionType": "R",
    "driverColors": {
      "VER": [6, 0, 239],
      "HAM": [39, 244, 210]
    }
  },
  "telemetry": {
    "frames": [
      {
        "t": 0.0,
        "drivers": {
          "VER": {
            "x": 1234.5,
            "y": 5678.9,
            "lap": 1,
            "speed": 305.2,
            "position": 1
          }
        }
      }
    ],
    "track_statuses": [...],
    "total_laps": 57
  }
}
```

## Performance Notes

- **Memory efficient**: Processes files >1GB with <50MB RAM usage
- **Stream-based**: Uses `stream-json` to parse incrementally
- **No blocking**: Node.js streams prevent blocking the event loop
- **Scalable**: Can handle multiple concurrent WebSocket clients

## Optional: NDJSON Format

For even faster processing, convert data to NDJSON (newline-delimited JSON):

```bash
# Convert to NDJSON (one frame per line)
jq -c '.telemetry.frames[]' race.json > race.ndjson
```

Then use the alternative loader:

```javascript
await streamManager.loadTelemetryNDJSON();
```

## Troubleshooting

**Port already in use:**

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9
```

**Out of memory:**

- Increase Node.js heap size: `node --max-old-space-size=4096 server.js`
- Reduce BUFFER_SIZE in CONFIG
- Convert to NDJSON format

**Slow streaming:**

- Reduce FRAME_INTERVAL for faster playback
- Increase PLAYBACK_SPEED multiplier
- Use SSD instead of HDD for data files

## Development

Watch mode (auto-restart on changes):

```bash
npm run dev
```

## Architecture

```
┌─────────────┐
│   Client    │
│  (Three.js) │
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────┐
│  WebSocket  │
│   Server    │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────────┐
│   Stream    │◄─────│  stream-json │
│   Manager   │      │   Pipeline   │
└──────┬──────┘      └──────┬───────┘
       │                    │
       │                    ▼
       │             ┌──────────────┐
       │             │  File Stream │
       │             │  (no full    │
       │             │   load!)     │
       ▼             └──────────────┘
┌─────────────┐
│   Frames    │
│   Buffer    │
└─────────────┘
```

## License

MIT

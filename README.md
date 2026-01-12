# F1 WebGPU Visualization

Een real-time 3D visualisatie van Formule 1 telemetrie data, gebouwd met WebGPU, Three.js en FastF1.

## Features

- 🏎️ **Live Telemetrie Replay**: Visualiseer historische F1 races met volledige telemetrie data
- 🗺️ **Dynamische Circuits**: Circuits worden automatisch gegenereerd uit telemetrie data
- 🎮 **Interactieve Playback**: Play/pause, speed controls, en timeline scrubbing
- 🎨 **Team Kleuren**: Auto's worden weergegeven in hun officiële team kleuren
- 📊 **WebSocket Streaming**: Efficiënte real-time data overdracht

## Tech Stack

### Frontend

- **WebGPU** - Hardware-versnelde 3D rendering
- **Three.js** - 3D graphics library
- **TypeScript** - Type-safe development
- **Vite** - Development server en build tool

### Backend

- **Node.js** - REST API en WebSocket server
- **Python + FastF1** - F1 data processing en telemetrie extractie
- **Flask** - Python API voor historische data

## Installatie

### Vereisten

- Node.js 18+
- Python 3.8+
- npm of yarn

### Setup

1. **Clone de repository**

```bash
git clone <repository-url>
cd f1-webgpu-visualization
```

2. **Installeer Frontend Dependencies**

```bash
npm install
```

3. **Installeer Backend Dependencies**

```bash
# Node.js backend
cd backend/node
npm install
cd ../..

# Python backend
cd backend/python
pip install -r requirements.txt
cd ../..
```

## Gebruik

### 1. Start Python API (Terminal 1)

```bash
cd backend/python
python api/server.py
```

De Python API draait op `http://localhost:5000`

### 2. Start Node.js Server (Terminal 2)

```bash
cd backend/node
node server.mjs
```

De Node.js server draait op `http://localhost:3001`

### 3. Start Frontend (Terminal 3)

```bash
npm run dev
```

De frontend draait op `http://localhost:5173`

## Data Workflow

1. **Selecteer Race**: Kies jaar, race, en sessie type via de UI
2. **Fetch Data**: Python script haalt data op via FastF1 en genereert telemetrie JSON
3. **Load Data**: Node.js server laadt de JSON file in memory voor streaming
4. **Visualize**: Frontend toont circuit en auto's, klaar voor playback
5. **Playback**: WebSocket stream stuurt telemetrie frames naar de frontend

## Project Structuur

```
f1-webgpu-visualization/
├── backend/
│   ├── node/              # REST API + WebSocket server
│   │   ├── server.mjs
│   │   └── package.json
│   └── python/            # FastF1 data processing
│       ├── api/
│       │   └── server.py  # Flask API
│       ├── lib/
│       │   ├── f1_data.py # Telemetrie processing
│       │   ├── track.py   # Circuit geometrie
│       │   ├── time.py
│       │   └── tyres.py
│       ├── fetch_race_data.py
│       └── requirements.txt
├── src/
│   ├── app/
│   │   ├── circuit/       # Circuit rendering
│   │   ├── playback/      # WebSocket & playback controls
│   │   ├── cars/          # Auto rendering
│   │   ├── core/          # Three.js setup
│   │   └── ui/            # UI components
│   ├── styles/
│   └── main.ts
├── public/
│   └── data/
│       └── telemetry/     # Gegenereerde telemetrie (niet in git)
└── package.json
```

## Ontwikkeling

### Nieuwe Features Toevoegen

1. **Circuit Features**: Bewerk `src/app/circuit/trackRenderer.ts`
2. **Playback Features**: Bewerk `src/app/playback/`
3. **Data Processing**: Bewerk `backend/python/lib/`

### Debugging

- **Frontend**: Open browser DevTools, bekijk console logs
- **Backend**: Bekijk terminal output van Node.js en Python servers
- **WebSocket**: Gebruik browser Network tab > WS filter

## Browser Support

WebGPU is vereist. Ondersteunde browsers:

- Chrome/Edge 113+
- Firefox 121+ (experimenteel)
- Safari 18+ (macOS 14+)

## Licentie

MIT

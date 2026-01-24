# F1 WebGPU Visualization

Een interactieve 3D Formule 1 visualisatie applicatie waarmee je echte F1 races en kwalificatiesessies kunt herbeleven met real-time telemetrie data.

![F1 Visualization](https://img.shields.io/badge/F1-Visualization-e10600?style=for-the-badge&logo=f1&logoColor=white)
![WebGPU](https://img.shields.io/badge/WebGPU-Powered-blue?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-3D-black?style=for-the-badge)

---

## 🚀 Installatie & Opstarten

### Vereisten

Zorg dat je de volgende software geïnstalleerd hebt:

| Software | Versie | Check commando |
|----------|--------|----------------|
| **Node.js** | 18.0.0 of hoger | `node --version` |
| **npm** | 8.0.0 of hoger | `npm --version` |
| **Python** | 3.9 of hoger | `python3 --version` |
| **pip** | Recent | `pip3 --version` |

### Stap 1: Repository clonen

```bash
git clone <repository-url>
cd f1-webgpu-visualization
```

### Stap 2: Frontend dependencies installeren

In de **root directory** van het project:

```bash
npm install
```

Dit installeert de volgende packages:
- `three` - 3D rendering engine
- `vite` - Development server en build tool
- `typescript` - Type checking
- `tailwindcss` - Styling

### Stap 3: Backend dependencies installeren

#### Node.js Backend

```bash
cd backend/node
npm install
cd ../..
```

Dit installeert:
- `express` - Web server
- `ws` - WebSocket server
- `@msgpack/msgpack` - Efficiënte data serialisatie

#### Python Backend

```bash
cd backend/python
pip3 install -r requirements.txt
cd ../..
```

Dit installeert:
- `fastf1` - Officiële F1 telemetrie data library
- `flask` - Python web server
- `pandas` / `numpy` - Data processing

> ⚠️ **Let op:** De eerste keer dat FastF1 data ophaalt kan dit enkele minuten duren. De data wordt gecached in `.fastf1-cache/`.

### Stap 4: De applicatie starten

Je moet **twee terminals** openen om de applicatie te draaien:

#### Terminal 1: Backend Server starten

```bash
cd backend/node
npm start
```

Je ziet:
```
🚀 F1 Visualization Server running on port 3001
📡 WebSocket server ready
```

#### Terminal 2: Frontend Development Server starten

```bash
npm run dev
```

Je ziet:
```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

### Stap 5: Openen in browser

Open **http://localhost:5173** in een WebGPU-compatibele browser (Chrome 113+ of Edge 113+).

#### ⚠️ WebGPU inschakelen (indien nodig)

Als je een foutmelding krijgt dat WebGPU niet ondersteund wordt, moet je het handmatig inschakelen:

1. Open een nieuw tabblad en ga naar `chrome://flags`
2. Zoek naar **"WebGPU"**
3. Zet **beide** WebGPU opties op **"Enabled"**:
   - `WebGPU`
   - `WebGPU Developer Features` (optioneel, voor debugging)
4. Klik op **"Relaunch"** om Chrome te herstarten
5. Open de applicatie opnieuw

---

### 🔄 Snelle Start (TL;DR)

```bash
# 1. Dependencies installeren (eenmalig)
npm install
cd backend/node && npm install && cd ../..
cd backend/python && pip3 install -r requirements.txt && cd ../..

# 2. Backend starten (Terminal 1)
cd backend/node && npm start

# 3. Frontend starten (Terminal 2)
npm run dev

# 4. Open http://localhost:5173 in Chrome/Edge
```

---

### 🏗️ Production Build

Voor een production build:

```bash
# Build de frontend
npm run build

# Preview de build lokaal
npm run preview
```

De gebouwde bestanden komen in de `dist/` folder.

---

### 🐳 Docker (Optioneel)

Voor deployment via Docker (gebruikt door Railway):

```bash
# Build de Docker image
docker build -t f1-visualization .

# Run de container
docker run -p 3001:3001 f1-visualization
```

---

### 📁 Project Structuur

```
f1-webgpu-visualization/
├── src/                    # Frontend TypeScript code
│   ├── app/               # Applicatie modules
│   │   ├── camera/        # Camera systemen (POV)
│   │   ├── cars/          # Auto rendering
│   │   ├── circuit/       # Circuit rendering
│   │   ├── core/          # Core 3D engine
│   │   ├── playback/      # Playback controller
│   │   └── ui/            # UI componenten
│   └── styles/            # CSS styling
├── backend/
│   ├── node/              # Node.js WebSocket server
│   └── python/            # Python FastF1 data fetcher
├── public/
│   ├── data/              # Gecachte telemetrie data
│   ├── files/             # 3D auto modellen (.glb)
│   └── images/            # UI assets
├── package.json           # Frontend dependencies
└── Dockerfile             # Docker configuratie
```

---

### 🔧 Configuratie

De backend configuratie staat in `backend/config.js`:

| Setting | Waarde | Beschrijving |
|---------|--------|--------------|
| `PORTS.NODE_SERVER` | 3001 | Backend API & WebSocket port |
| `PORTS.VITE_DEV` | 5173 | Frontend development port |
| `TELEMETRY.FPS` | 25 | Frames per seconde |
| `DATA.MIN_YEAR` | 2018 | Oudste beschikbare data |

---

## 📖 Gebruikershandleiding

### Aan de slag

#### Browser Vereisten
- Een moderne browser met **WebGPU ondersteuning** (Chrome 113+, Edge 113+, of Firefox Nightly)
- Een actieve internetverbinding
- Een geldige **Bearer Token** voor authenticatie

#### De applicatie gebruiken

1. **Open de applicatie** in je browser op `http://localhost:5173`
2. Je ziet het **Data Selectie Scherm** waar je een race kunt kiezen

---

### 🎯 Stap 1: Race Selecteren

#### Jaar kiezen
Klik op een van de jaar-kaarten (bijv. **2024**, **2025**) om het seizoen te selecteren.

#### Grand Prix kiezen
- Scroll door de beschikbare races en klik op de gewenste **Grand Prix**
- Races met een **"CACHED"** badge hebben al data opgeslagen en laden sneller

#### Sessie kiezen
Selecteer het type sessie dat je wilt bekijken:
- **Race (R)** - De volledige race
- **Qualifying (Q)** - Kwalificatiesessie (Q1, Q2, Q3)
- **Sprint Qualifying (SQ)** - Sprint kwalificatie
- **Practice (FP1, FP2, FP3)** - Vrije trainingen

#### Authenticatie
Voer je **Bearer Token** in het authenticatieveld in. Deze token wordt lokaal opgeslagen voor toekomstig gebruik.

#### Graphics Instellingen (optioneel)
Klik op het **⚙️ tandwiel icoon** rechtsboven om de graphics instellingen te openen:
- **Detailed 3D Models** - Volledige getextureerde F1 auto's (mooier, zwaarder)
- **Low Poly** - Simpele vormen voor betere performance

#### Data laden
Klik op **"LOAD DATA & START"** om de data op te halen en de visualisatie te starten.

> 💡 **Tip:** De terminal onderaan toont de voortgang van het laden. Bij de eerste keer laden kan dit enkele minuten duren.

---

### 🎮 Stap 2: De Visualisatie Bedienen

Zodra de data is geladen, zie je een **3D bovenaanzicht** van het circuit met alle auto's.

#### Camera Besturing (Orbit Mode)

| Actie | Bediening |
|-------|-----------|
| **Draaien** | Klik + sleep met linkermuisknop |
| **Zoomen** | Scrollwiel |
| **Pannen** | Klik + sleep met rechtermuisknop |

---

### ▶️ Stap 3: Playback Controls

De **playback balk** onderaan het scherm geeft je volledige controle over de weergave:

#### Afspeelknoppen
| Knop | Functie |
|------|---------|
| ▶️ / ⏸️ | Play / Pause |
| ⏪ | 10 seconden terug |
| ⏩ | 10 seconden vooruit |
| ➖ / ➕ | Snelheid verlagen / verhogen |

#### Sneltoetsen

| Toets | Actie |
|-------|-------|
| `Spatiebalk` | Play / Pause |
| `←` Pijl links | 10 seconden terug |
| `→` Pijl rechts | 10 seconden vooruit |
| `↑` Pijl omhoog | Snelheid verhogen (2x) |
| `↓` Pijl omlaag | Snelheid verlagen (0.5x) |
| `1` | Snelheid 0.5x |
| `2` | Snelheid 1x (normaal) |
| `3` | Snelheid 2x |
| `4` | Snelheid 4x |
| `R` | Reset naar begin |

#### Timeline
- **Klik** ergens op de tijdlijn om naar dat moment te springen
- **Sleep** om door de sessie te scrubben
- **Markers** op de tijdlijn tonen belangrijke events (DNF's, Safety Cars, vlaggen)
- **Hover** over markers voor meer informatie

#### Streaming Mode
Via het dropdown menu kun je kiezen tussen:
- **Smooth** - Vloeiende weergave
- **Accurate** - Frame-accurate weergave

---

### 📊 Stap 4: Het Leaderboard

Het **leaderboard** aan de rechterkant toont de actuele stand:

#### Race Mode
- **Positie** - Huidige positie in de race
- **Driver Code** - 3-letter code (bijv. VER, HAM, LEC)
- **Interval** - Tijd achter de leider of auto voor je
- **Laatste Lap** - Laatste rondetijd
- **Band Compound** - Huidige band (Soft 🔴 / Medium 🟡 / Hard ⚪ / Inters 🟢 / Wets 🔵)
- **Pitstop indicator** - "PIT" verschijnt wanneer een coureur in de pits is

#### Qualifying Mode
- **Beste tijd per segment** (Q1, Q2, Q3)
- **Eliminatie indicator** - Coureurs die zijn afgevallen worden gemarkeerd
- **Sessie timer** - Resterende tijd in de huidige fase

#### Interactie
- **Klik op een coureur** om naar de POV (cockpit) view te schakelen

---

### 🎥 Stap 5: POV Camera Mode

Klik op een coureur in het leaderboard om de **cockpit view** te activeren.

#### POV Display (HUD)
In POV mode zie je een heads-up display met:
- **Snelheid** - In km/h en mph
- **Versnelling** - Huidige gear (N, 1-8)
- **Throttle meter** - Gas percentage (linkerkant)
- **Brake meter** - Rem percentage (rechterkant)
- **RPM balk** - Toerental indicator
- **DRS indicator** - Licht op wanneer DRS actief is

#### POV Controls

| Actie | Bediening |
|-------|-----------|
| **Andere coureur volgen** | Klik op andere coureur in leaderboard |
| **POV verlaten** | Druk op `Escape` |

> 💡 **Tip:** Bij hoge snelheden (260+ km/h) beweegt het display licht mee voor een realistisch effect.

---

### 🌤️ Stap 6: Weather Widget

Linksboven zie je de **weather widget** met actuele baanomstandigheden:
- **Track** - Baantemperatuur (°C)
- **Air** - Luchttemperatuur (°C)
- **Humidity** - Luchtvochtigheid (%)
- **Wind** - Windsnelheid en -richting
- **Conditions** - DRY of RAINING

---

### 🏁 Sessie Types

#### Race
- Volledige race weergave
- Posities, intervallen, pitstops
- Rondeteller linksboven

#### Qualifying (Q / SQ)
- Drie fases: Q1 → Q2 → Q3
- Countdown timer per fase
- Automatische eliminatie weergave
- Beste tijden per fase

---

### 💡 Tips & Tricks

1. **Sneller laden**: Selecteer races met "CACHED" badge - deze laden direct
2. **Performance issues?**: Schakel over naar "Low Poly" mode in de graphics settings
3. **Specifiek moment bekijken**: Gebruik de timeline markers om snel naar interessante momenten te springen
4. **Vergelijk coureurs**: Schakel snel tussen POV views door op verschillende coureurs te klikken

---

### 🔧 Troubleshooting

| Probleem | Oplossing |
|----------|-----------|
| **"WebGPU not supported"** | Gebruik Chrome 113+ of Edge 113+ |
| **Geen data laden** | Controleer je Bearer Token |
| **Langzaam laden** | Eerste keer laden duurt langer, data wordt gecached |
| **Auto's niet zichtbaar** | Wacht tot "Loading 3D car models..." klaar is |
| **WebSocket error** | Controleer of de backend server draait |

---

### 🎨 Ondersteunde Teams

De applicatie bevat gedetailleerde 3D modellen voor alle 10 F1 teams:

| Team | Model |
|------|-------|
| Red Bull Racing | ✅ |
| Ferrari | ✅ |
| Mercedes | ✅ |
| McLaren | ✅ |
| Aston Martin | ✅ |
| Alpine | ✅ |
| Williams | ✅ |
| Racing Bulls | ✅ |
| Kick Sauber | ✅ |
| Haas | ✅ |

---

### 📱 Ondersteunde Browsers

| Browser | Versie | Status |
|---------|--------|--------|
| Chrome | 113+ | ✅ Volledig ondersteund |
| Edge | 113+ | ✅ Volledig ondersteund |
| Firefox | Nightly | ⚠️ Experimenteel |
| Safari | - | ❌ Geen WebGPU support |

---

## Veel plezier met het herbeleven van spannende F1 momenten! 🏎️

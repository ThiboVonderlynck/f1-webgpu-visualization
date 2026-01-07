# F1 Circuit Generator - Gebruikshandleiding

Dit script genereert 3D STL bestanden van F1-circuits op basis van echte telemetrie data via de FastF1 API.

## ⚠️ BELANGRIJKE OPMERKING

**Wat je WEL krijgt:**

- ✅ Exacte 3D vorm van elk circuit
- ✅ Juiste hoogteverschillen (bergop/bergaf)
- ✅ Correcte schaal (in meters)
- ✅ Ribbon mesh met breedte (~12m, zoals echte F1 track)

**Wat je NIET krijgt:**

- ❌ Geen textures (geen asfalt, gras, gravel)
- ❌ Geen curbstones (rode/witte randen)
- ❌ Geen track details (pitlane, start/finish lijn)
- ❌ Alleen de hoofdbaan (geen run-off areas, paddock, etc.)

**De circuits zijn "clean" ribbons** - je moet zelf curbstones en textures toevoegen (in Blender of Three.js).

## Installatie

### 1. Python Environment Setup

```bash
# Navigeer naar de scripts folder
cd scripts

# Maak een virtual environment (aanbevolen)
python3 -m venv venv

# Activeer het virtual environment
# macOS/Linux:
source venv/bin/activate
# Windows:
# venv\Scripts\activate

# Installeer dependencies
pip install -r requirements.txt
```

### 2. Script Uitvoeren

```bash
# Zorg dat je in de scripts folder bent en venv actief is
python generate_circuits_from_fastf1.py
```

## Wat gebeurt er?

1. **Download telemetry data** - Voor elk circuit uit het 2024 F1 seizoen
2. **Interpolatie** - Smooth de coördinaten met cubic spline
3. **Mesh generatie** - Maakt een 3D ribbon van ~12m breed
4. **Export STL** - Slaat op in `public/assets/circuits/generated/`

⏱️ **Verwachte tijd:** 5-15 minuten (afhankelijk van internet snelheid)

💾 **Data download:** ~100-500MB aan cache data

## Configuratie

Je kunt parameters aanpassen in het script:

```python
# Track afmetingen
TRACK_WIDTH = 12.0        # Breedte in meters (standaard F1 track)
TRACK_HEIGHT = 0.5        # Dikte van het mesh
INTERPOLATION_DISTANCE = 5.0  # Afstand tussen punten (lager = meer detail)
```

## Output

Circuits worden opgeslagen als:

```
public/assets/circuits/generated/
├── bahrain.stl
├── saudi.stl
├── australia.stl
├── japan.stl
├── ...
└── abu-dhabi.stl
```

## Vergelijking met bestaande circuits

| Aspect     | Jouw STL's  | FastF1 Generated              |
| ---------- | ----------- | ----------------------------- |
| Vorm       | ✅ Accuraat | ✅ Zeer accuraat (echte data) |
| Hoogte     | ✅ Ja       | ✅ Ja (realistisch)           |
| Breedte    | ✅ Ja       | ✅ Ja (~12m)                  |
| Curbstones | ❌ Nee      | ❌ Nee                        |
| Textures   | ❌ Nee      | ❌ Nee                        |
| Details    | ?           | ❌ Minimaal                   |

## Problemen oplossen

### "No module named 'fastf1'"

```bash
pip install fastf1
```

### "No data found for [circuit]"

Sommige circuits hebben mogelijk geen race data in 2024. Probeer een ander jaar:

```python
telemetry = get_circuit_telemetry(2023, circuit)  # Probeer 2023
```

### Script is traag

- Eerste run: FastF1 download veel data (cache wordt opgebouwd)
- Volgende runs: Veel sneller door cache
- Je kunt `INTERPOLATION_DISTANCE` verhogen (bijv. 10.0) voor minder detail maar snellere generatie

### STL files zijn te groot

Verhoog `INTERPOLATION_DISTANCE`:

```python
INTERPOLATION_DISTANCE = 10.0  # Minder punten = kleiner bestand
```

## Volgende stappen

1. **Vergelijk met je huidige circuits**

   ```bash
   ls -lh public/assets/circuits/*.stl
   ls -lh public/assets/circuits/generated/*.stl
   ```

2. **Test één circuit** in je app door het toe te voegen aan `circuitDiscovery.ts`:

   ```typescript
   { filename: 'generated/monaco.stl', format: 'stl', displayName: 'Monaco GP (Generated)' }
   ```

3. **Voeg curbstones toe** in Three.js:
   - Optie A: Procedural shader voor rode/witte stripes
   - Optie B: Detecteer edges en voeg geometrie toe
   - Optie C: Gebruik textures

## Credits

- **FastF1**: https://github.com/theOehrly/Fast-F1
- **F1 Data**: Officiële F1 telemetrie
- **numpy-stl**: https://github.com/WoLpH/numpy-stl

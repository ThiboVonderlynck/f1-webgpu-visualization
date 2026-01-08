import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Races 2024
const RACES_2024 = {
  1: "Bahrain",
  2: "Saudi Arabia",
  3: "Australia",
  4: "Japan",
  5: "China",
  6: "Miami",
  7: "Emilia Romagna",
  8: "Monaco",
  9: "Canada",
  10: "Spain",
  11: "Austria",
  12: "Great Britain",
  13: "Hungary",
  14: "Belgium",
  15: "Netherlands",
  16: "Italy",
  17: "Azerbaijan",
  18: "Singapore",
  19: "United States",
  20: "Mexico",
  21: "Brazil",
  22: "Las Vegas",
  23: "Qatar",
  24: "Abu Dhabi"
};

// Get available races
app.get('/api/races', (req, res) => {
  const races = Object.entries(RACES_2024).map(([round, name]) => ({
    round: parseInt(round),
    name
  }));
  res.json({ races, years: [2024, 2023] });
});

// Fetch race data
app.post('/api/fetch', async (req, res) => {
  const { year, round, sessionType = 'R' } = req.body;

  if (!year || !round) {
    return res.status(400).json({ error: 'Year and round are required' });
  }

  try {
    const scriptPath = path.join(__dirname, '../fetch_race_data.py');
    const venvPython = path.join(__dirname, '../venv/bin/python');
    
    const command = `cd ${path.dirname(scriptPath)} && ${venvPython} fetch_race_data.py ${year} ${round} ${sessionType}`;
    
    console.log(`Executing: ${command}`);
    
    // Start the process
    const child = exec(command);
    
    // Stream output to client
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
          message: `Data fetched for ${RACES_2024[round]} ${year}`,
          output 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch data',
          output 
        });
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check if data exists
app.get('/api/check/:year/:round/:sessionType', async (req, res) => {
  const { year, round, sessionType } = req.params;
  const raceName = RACES_2024[parseInt(round)]?.toLowerCase().replace(/\s+/g, '-');
  const sessionSuffix = sessionType === 'Q' ? 'qualifying' : 'race';
  
  // Check if file exists
  const fs = await import('fs');
  const dataPath = path.join(__dirname, `../../../public/data/telemetry/${year}/${round.padStart(2, '0')}-${raceName}_${sessionSuffix}.json`);
  
  res.json({ 
    exists: fs.existsSync(dataPath),
    path: dataPath
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🏎️  F1 Data API running on http://localhost:${PORT}`);
});

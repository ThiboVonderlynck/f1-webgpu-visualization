interface Race {
  round: number;
  name: string;
  date?: string;
  country?: string;
  type?: string;
}

interface Session {
  code: string;
  name: string;
}

interface FetchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// API URLs (following reference solution pattern)
const PYTHON_API_URL = 'http://localhost:3002/api'; // Flask API for data selection
const NODE_API_URL = 'http://localhost:3001/api'; // Node.js for fetch/load

// Removed RACE_TO_CIRCUIT mapping - tracks now built from telemetry data

export class DataFetcher {
  private container: HTMLElement;
  private years: number[] = [];
  private races: Race[] = [];
  private sessions: Session[] = [];
  private selectedYear: number = 2024;
  private selectedRound: number = 1;
  private selectedSession: string = 'R';
  private onDataFetched?: (year: number, round: number, sessionType: string, trackData: any) => void;

  constructor(container: HTMLElement, onDataFetched?: (year: number, round: number, sessionType: string, trackData: any) => void) {
    this.container = container;
    this.onDataFetched = onDataFetched;
    this.init();
  }

  private async init() {
    await this.loadYears();
    await this.loadRaces(this.selectedYear);
    await this.loadSessions(this.selectedYear, this.selectedRound);
    this.render();
  }

  private async loadYears() {
    try {
      const response = await fetch(`${PYTHON_API_URL}/years`);
      const data = await response.json();
      if (data.success) {
        this.years = data.years;
        this.selectedYear = this.years[0] || 2024;
      }
    } catch (error) {
      console.error('Failed to load years:', error);
      this.years = [2024, 2023, 2022]; // Fallback
    }
  }

  private async loadRaces(year: number) {
    try {
      const response = await fetch(`${PYTHON_API_URL}/races?year=${year}`);
      const data = await response.json();
      if (data.success) {
        this.races = data.races;
        this.selectedRound = this.races[0]?.round || 1;
      }
    } catch (error) {
      console.error('Failed to load races:', error);
      this.races = [];
    }
  }

  private async loadSessions(year: number, round: number) {
    try {
      const response = await fetch(`${PYTHON_API_URL}/sessions?year=${year}&round=${round}`);
      const data = await response.json();
      if (data.success) {
        this.sessions = data.sessions;
        this.selectedSession = this.sessions[0]?.code || 'R';
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      this.sessions = [
        { code: 'Q', name: 'Qualifying' },
        { code: 'R', name: 'Race' },
      ];
    }
  }

  private render() {
    this.container.innerHTML = `
      <div class="data-fetcher">
        <h2>🏎️ F1 Telemetry Fetcher</h2>
        
        <div class="form">
          <div class="field">
            <label>Year</label>
            <select id="year-select">
              ${this.years.map((year) => `<option value="${year}" ${year === this.selectedYear ? 'selected' : ''}>${year} Season</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label>Grand Prix</label>
            <select id="race-select">
              ${this.races
                .map(
                  (race) => `
                  <option value="${race.round}" ${race.round === this.selectedRound ? 'selected' : ''}>
                    Round ${race.round} - ${race.name}
                  </option>
                `
                )
                .join('')}
            </select>
          </div>

          <div class="field">
            <label>Session Type</label>
            <select id="session-select">
              ${this.sessions
                .map((session) => {
                  const icon = session.code === 'R' ? '🏁' : session.code === 'Q' ? '⏱️' : '⚡';
                  return `<option value="${session.code}" ${session.code === this.selectedSession ? 'selected' : ''}>${icon} ${session.name}</option>`;
                })
                .join('')}
            </select>
          </div>

          <button id="fetch-button">Load Data & Start</button>
        </div>

        <div class="progress-container" id="progress-container">
          <div class="progress-bar-wrapper">
            <div class="progress-bar" id="progress-bar" style="width: 0%"></div>
          </div>
          <div class="progress-text">
            <span id="progress-status">Fetching data...</span>
            <span class="progress-percentage" id="progress-percentage">0%</span>
          </div>
        </div>

        <div id="message-container"></div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const button = this.container.querySelector('#fetch-button') as HTMLButtonElement;
    const yearSelect = this.container.querySelector('#year-select') as HTMLSelectElement;
    const raceSelect = this.container.querySelector('#race-select') as HTMLSelectElement;
    const sessionSelect = this.container.querySelector('#session-select') as HTMLSelectElement;

    button?.addEventListener('click', () => this.handleFetch());

    // Update races when year changes (reference solution pattern)
    yearSelect?.addEventListener('change', async () => {
      this.selectedYear = parseInt(yearSelect.value);
      await this.loadRaces(this.selectedYear);
      this.render();
    });

    // Update sessions when race changes
    raceSelect?.addEventListener('change', async () => {
      this.selectedRound = parseInt(raceSelect.value);
      await this.loadSessions(this.selectedYear, this.selectedRound);
      this.render();
    });

    sessionSelect?.addEventListener('change', () => {
      this.selectedSession = sessionSelect.value;
    });
  }

  private async handleFetch() {
    const yearSelect = this.container.querySelector('#year-select') as HTMLSelectElement;
    const raceSelect = this.container.querySelector('#race-select') as HTMLSelectElement;
    const sessionSelect = this.container.querySelector('#session-select') as HTMLSelectElement;
    const button = this.container.querySelector('#fetch-button') as HTMLButtonElement;
    const messageContainer = this.container.querySelector('#message-container') as HTMLElement;
    const progressContainer = this.container.querySelector('#progress-container') as HTMLElement;
    const progressBar = this.container.querySelector('#progress-bar') as HTMLElement;
    const progressPercentage = this.container.querySelector('#progress-percentage') as HTMLElement;
    const progressStatus = this.container.querySelector('#progress-status') as HTMLElement;

    const year = parseInt(yearSelect.value);
    const round = parseInt(raceSelect.value);
    const sessionType = sessionSelect.value;

    button.disabled = true;
    button.innerHTML = '<span class="loading-spinner"></span>Fetching...';
    messageContainer.innerHTML = '';

    // Show progress bar
    progressContainer.classList.add('active');

    // Simulate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      progressBar.style.width = `${progress}%`;
      progressPercentage.textContent = `${Math.round(progress)}%`;
    }, 300);

    try {
      // Step 1: Check if data exists (defensive programming)
      progressStatus.textContent = 'Checking data...';
      const checkResponse = await fetch(`${NODE_API_URL}/check/${year}/${round}/${sessionType}`);
      const checkData = await checkResponse.json();

      let needsFetch = !checkData.exists;

      // Step 2: Fetch if needed
      if (needsFetch) {
        progressStatus.textContent = 'Fetching from FastF1...';
        const fetchResponse = await fetch(`${NODE_API_URL}/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, round, sessionType }),
        });

        const fetchData: FetchResponse = await fetchResponse.json();
        if (!fetchData.success) {
          throw new Error(fetchData.error || 'Failed to fetch data');
        }
        console.log('✓ Data fetched successfully');
      } else {
        console.log('✓ Data already exists');
      }

      // Step 3: Load into Node.js server
      progressStatus.textContent = 'Loading telemetry...';
      const loadResponse = await fetch(`${NODE_API_URL}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, round, sessionType }),
      });

      const loadData = await loadResponse.json();

      clearInterval(progressInterval);
      progressBar.style.width = '100%';
      progressPercentage.textContent = '100%';

      if (loadData.success) {
        progressStatus.textContent = 'Complete!';
        messageContainer.innerHTML = `
          <div class="message success">
            ✓ Loaded ${loadData.totalFrames.toLocaleString()} frames<br>
            Drivers: ${loadData.drivers.length}<br><br>
            🚀 Starting visualization...
          </div>
        `;

        // Hide the fetcher after successful load
        setTimeout(() => {
          this.container.style.display = 'none';
          // Call callback to start the visualization with track data
          if (this.onDataFetched) {
            this.onDataFetched(year, round, sessionType, loadData.track);
          }
        }, 2000);
      } else {
        throw new Error(loadData.error || 'Failed to load data');
      }
    } catch (error) {
      clearInterval(progressInterval);
      progressStatus.textContent = 'Error';
      progressBar.style.background = 'linear-gradient(90deg, #dc3545 0%, #ff4d4d 100%)';
      messageContainer.innerHTML = `<div class="message error">✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = 'Fetch Data';

      // Hide progress bar after a delay if there was an error
      if (!messageContainer.querySelector('.success')) {
        setTimeout(() => {
          progressContainer.classList.remove('active');
        }, 3000);
      }
    }
  }

  // Removed getCircuitForRound - tracks now built from telemetry data
}

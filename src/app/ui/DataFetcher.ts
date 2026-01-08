interface Race {
  round: number;
  name: string;
}

interface FetchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const API_URL = 'http://localhost:3001/api';

// Map race round numbers to circuit filenames
const RACE_TO_CIRCUIT: { [key: number]: string } = {
  1: 'bahrain.stl',
  2: 'saudi.stl',
  3: 'australia.stl',
  4: 'japon.stl',
  5: 'chinesse.stl',
  6: 'miami.stl',
  7: 'romagna.stl',
  8: 'monaco.stl',
  9: 'canadian.stl',
  10: 'spanish.stl',
  11: 'austrian.stl',
  12: 'british.stl',
  13: 'hungarian.stl',
  14: 'belgique.stl',
  15: 'dutch.stl',
  16: 'italian.stl',
  17: 'azerbaijan.stl',
  18: 'singapour.stl',
  19: 'usa.stl',
  20: 'mexique.stl',
  21: 'brazilian.stl',
  22: 'usa-lv.stl',
  23: 'quatar.stl',
  24: 'abu-dhabi.stl',
};

export class DataFetcher {
  private container: HTMLElement;
  private races: Race[] = [];
  private onDataFetched?: (year: number, round: number, sessionType: string) => void;

  constructor(container: HTMLElement, onDataFetched?: (year: number, round: number, sessionType: string) => void) {
    this.container = container;
    this.onDataFetched = onDataFetched;
    this.init();
  }

  private async init() {
    await this.loadRaces();
    this.render();
  }

  private async loadRaces() {
    try {
      const response = await fetch(`${API_URL}/races`);
      const data = await response.json();
      this.races = data.races;
    } catch (error) {
      console.error('Failed to load races:', error);
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
              <option value="2024">2024 Season</option>
              <option value="2023">2023 Season</option>
            </select>
          </div>

          <div class="field">
            <label>Grand Prix</label>
            <select id="race-select">
              ${this.races
                .map(
                  (race) => `
                <option value="${race.round}">Round ${race.round} - ${race.name}</option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="field">
            <label>Session Type</label>
            <select id="session-select">
              <option value="R">🏁 Race</option>
              <option value="Q">⏱️ Qualifying</option>
              <option value="S">⚡ Sprint</option>
              <option value="SQ">⚡ Sprint Qualifying</option>
            </select>
          </div>

          <button id="fetch-button">Fetch Data</button>
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
    button?.addEventListener('click', () => this.handleFetch());
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
      const response = await fetch(`${API_URL}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, round, sessionType }),
      });

      const data: FetchResponse = await response.json();

      clearInterval(progressInterval);
      progressBar.style.width = '100%';
      progressPercentage.textContent = '100%';

      if (data.success) {
        progressStatus.textContent = 'Complete!';
        messageContainer.innerHTML = `<div class="message success">✓ ${data.message}<br><br>🚀 Starting visualization...</div>`;

        // Hide the fetcher after successful fetch
        setTimeout(() => {
          this.container.style.display = 'none';
          // Call callback to start the visualization with race info
          if (this.onDataFetched) {
            this.onDataFetched(year, round, sessionType);
          }
        }, 2000);
      } else {
        progressStatus.textContent = 'Failed';
        progressBar.style.background = 'linear-gradient(90deg, #dc3545 0%, #ff4d4d 100%)';
        messageContainer.innerHTML = `<div class="message error">✗ ${data.error}</div>`;
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

  // Get circuit filename for a given round
  static getCircuitForRound(round: number): string | null {
    return RACE_TO_CIRCUIT[round] || null;
  }
}

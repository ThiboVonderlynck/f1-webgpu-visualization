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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export class DataFetcher {
  private container: HTMLElement;
  private years: number[] = [];
  private races: Race[] = [];
  private sessions: Session[] = [];
  private cachedRaces: { [round: number]: string[] } = {};
  private selectedYear: number = 2024;
  private selectedRound: number = 0;
  private selectedSession: string = '';
  private isLoadingRaces: boolean = false;
  private isLoadingSessions: boolean = false;
  private onDataFetched?: (year: number, round: number, sessionType: string, trackData: any) => void;

  constructor(container: HTMLElement, onDataFetched?: (year: number, round: number, sessionType: string, trackData: any) => void) {
    this.container = container;
    this.onDataFetched = onDataFetched;
    this.init();
  }

  private async init() {
    await this.loadYears();
    await this.loadRaces(this.selectedYear);
    await this.loadCachedStatus(this.selectedYear);
    await this.loadSessions(this.selectedYear, this.selectedRound);
    this.render();
  }

  private async loadYears() {
    try {
      const response = await fetch(`${API_URL}/years`);
      const data = await response.json();
      if (data.success) {
        this.years = data.years;
        this.selectedYear = this.years[0] || 2024;
      }
    } catch (error) {
      console.error('Failed to load years:', error);
      this.years = [2024, 2023, 2022];
    }
  }

  private async loadRaces(year: number) {
    try {
      const response = await fetch(`${API_URL}/races?year=${year}`);
      const data = await response.json();
      if (data.success) {
        this.races = data.races;
      }
    } catch (error) {
      console.error('Failed to load races:', error);
      this.races = [];
    }
  }

  private async loadSessions(year: number, round: number) {
    try {
      const response = await fetch(`${API_URL}/sessions?year=${year}&round=${round}`);
      const data = await response.json();
      if (data.success) {
        this.sessions = data.sessions;
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      this.sessions = [
        { code: 'Q', name: 'Qualifying' },
        { code: 'R', name: 'Race' },
      ];
    }
  }

  private async loadCachedStatus(year: number) {
    try {
      const response = await fetch(`${API_URL}/cached/${year}`);
      const data = await response.json();
      if (data.success) {
        this.cachedRaces = data.cached;
      }
    } catch (error) {
      console.error('Failed to load cache status:', error);
      this.cachedRaces = {};
    }
  }

  private renderRaceSkeletons(): string {
    const skeletons = [];
    for (let i = 0; i < 24; i++) {
      skeletons.push(`
        <div class="option-card skeleton">
          <div class="skeleton-round"></div>
          <div class="skeleton-text"></div>
        </div>
      `);
    }
    return skeletons.join('');
  }

  private renderSessionSkeletons(): string {
    const skeletons = [];
    for (let i = 0; i < 4; i++) {
      skeletons.push(`
        <div class="option-card skeleton">
          <div class="skeleton-text"></div>
        </div>
      `);
    }
    return skeletons.join('');
  }

  private render() {
    const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    
    this.container.innerHTML = `
      <div class="data-fetcher">
        <div class="data-fetcher-header">
          <div class="logo-container">
            <div class="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8m-4-4h8"/>
              </svg>
            </div>
            <h1>F1 TELEMETRY FETCHER</h1>
          </div>
          <div class="divider"></div>
        </div>

        <div class="section">
          <div class="section-title">Select Year</div>
          <div class="option-grid years">
            ${this.years.map(year => `
              <div class="option-card ${year === this.selectedYear ? 'selected' : ''}" data-type="year" data-value="${year}">
                <div class="check-icon">${checkIcon}</div>
                <div class="option-text">${year}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Select Grand Prix</div>
          <div class="option-grid races">
            ${this.isLoadingRaces ? this.renderRaceSkeletons() : this.races.map(race => {
              const cached = this.cachedRaces[race.round] || [];
              const hasCached = cached.length > 0;
              return `
              <div class="option-card ${race.round === this.selectedRound ? 'selected' : ''} ${hasCached ? 'cached' : ''}" data-type="race" data-value="${race.round}">
                <div class="check-icon">${checkIcon}</div>
                ${hasCached ? '<div class="cached-badge">CACHED</div>' : ''}
                <div class="round-label">ROUND ${race.round}</div>
                <div class="option-text">${race.name}</div>
              </div>
            `}).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-title">Select Session</div>
          <div class="option-grid sessions">
            ${this.isLoadingSessions ? this.renderSessionSkeletons() : this.sessions.map(session => {
              const cachedSessions = this.cachedRaces[this.selectedRound] || [];
              const isSessionCached = cachedSessions.includes(session.code);
              return `
              <div class="option-card ${session.code === this.selectedSession ? 'selected' : ''} ${isSessionCached ? 'cached' : ''}" data-type="session" data-value="${session.code}">
                <div class="check-icon">${checkIcon}</div>
                ${isSessionCached ? '<div class="cached-badge">CACHED</div>' : ''}
                <div class="option-text">${session.name}</div>
              </div>
            `}).join('')}
          </div>
        </div>

        <div class="load-button-container">
          <button class="load-button" id="fetch-button">LOAD DATA & START</button>
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

    this.container.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const type = target.dataset.type;
        const value = target.dataset.value;

        if (type === 'year') {
          this.selectedYear = parseInt(value!);
          this.selectedRound = 0;
          this.selectedSession = '';
          this.isLoadingRaces = true;
          this.races = [];
          this.sessions = [];
          this.render();
          await this.loadRaces(this.selectedYear);
          await this.loadCachedStatus(this.selectedYear);
          this.isLoadingRaces = false;
          this.render();
        } else if (type === 'race') {
          this.selectedRound = parseInt(value!);
          this.selectedSession = '';
          this.isLoadingSessions = true;
          this.sessions = [];
          this.render();
          await this.loadSessions(this.selectedYear, this.selectedRound);
          // Auto-select "Race" session as default (most common use case)
          const raceSession = this.sessions.find(s => s.code === 'R');
          if (raceSession) {
            this.selectedSession = 'R';
          }
          this.isLoadingSessions = false;
          this.render();
        } else if (type === 'session') {
          this.selectedSession = value!;
          this.container.querySelectorAll('.option-card[data-type="session"]').forEach(c => c.classList.remove('selected'));
          target.classList.add('selected');
        }
      });
    });
  }

  private async handleFetch() {
    const button = this.container.querySelector('#fetch-button') as HTMLButtonElement;
    const messageContainer = this.container.querySelector('#message-container') as HTMLElement;
    const progressContainer = this.container.querySelector('#progress-container') as HTMLElement;
    const progressBar = this.container.querySelector('#progress-bar') as HTMLElement;
    const progressPercentage = this.container.querySelector('#progress-percentage') as HTMLElement;
    const progressStatus = this.container.querySelector('#progress-status') as HTMLElement;

    const year = this.selectedYear;
    const round = this.selectedRound;
    const sessionType = this.selectedSession;

    if (!round || !sessionType) {
      messageContainer.innerHTML = '<div class="message error">Please select a Grand Prix and Session first</div>';
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span class="loading-spinner"></span>LOADING...';
    messageContainer.innerHTML = '';

    progressContainer.classList.add('active');

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      progressBar.style.width = `${progress}%`;
      progressPercentage.textContent = `${Math.round(progress)}%`;
    }, 300);

    try {
      progressStatus.textContent = 'Checking data...';
      const checkResponse = await fetch(`${API_URL}/check/${year}/${round}/${sessionType}`);
      const checkData = await checkResponse.json();

      let needsFetch = !checkData.exists;

      if (needsFetch) {
        progressStatus.textContent = 'Fetching from FastF1...';
        const fetchResponse = await fetch(`${API_URL}/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, round, sessionType }),
        });

        const fetchData: FetchResponse = await fetchResponse.json();
        if (!fetchData.success) {
          throw new Error(fetchData.error || 'Failed to fetch data');
        }
      }

      progressStatus.textContent = 'Loading telemetry...';
      const loadResponse = await fetch(`${API_URL}/load`, {
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
            ✓ Loaded ${loadData.totalFrames.toLocaleString()} frames • ${loadData.drivers.length} drivers
          </div>
        `;

        // Wait a moment for the success message, then initialize visualization
        // Use await with a promise-based delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (this.onDataFetched) {
          progressStatus.textContent = 'Starting visualization...';
          await this.onDataFetched(year, round, sessionType, loadData.track);
          // Only hide after visualization is fully initialized
          this.container.style.display = 'none';
        }
      } else {
        throw new Error(loadData.error || 'Failed to load data');
      }
    } catch (error) {
      clearInterval(progressInterval);
      progressStatus.textContent = 'Error';
      progressBar.style.background = 'linear-gradient(90deg, #dc3545 0%, #ff4d4d 100%)';
      messageContainer.innerHTML = `<div class="message error">✗ ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
      
      // Only re-enable button on error
      button.disabled = false;
      button.textContent = 'LOAD DATA & START';
      
      setTimeout(() => {
        progressContainer.classList.remove('active');
      }, 3000);
    }
  }
}

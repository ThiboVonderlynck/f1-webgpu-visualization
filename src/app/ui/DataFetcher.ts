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
  private bearerToken: string = '';
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

        <div class="section token-section">
          <div class="section-title">Authentication <span class="required-badge">REQUIRED</span></div>
          <div class="token-input-container">
            <input 
              type="password" 
              id="bearer-token-input" 
              class="token-input" 
              placeholder="Enter Bearer Token"
              value="${this.bearerToken}"
            />
          </div>
        </div>

        <div class="terminal-container" id="terminal-container">
          <div class="terminal-header">
            <span class="terminal-title">Console Output</span>
            <div class="terminal-controls">
              <span class="terminal-dot"></span>
              <span class="terminal-dot"></span>
              <span class="terminal-dot"></span>
            </div>
          </div>
          <div class="terminal-output" id="terminal-output"></div>
        </div>

        <div id="message-container"></div>

        <div class="load-button-container">
          <button class="load-button" id="fetch-button">LOAD DATA & START</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    const button = this.container.querySelector('#fetch-button') as HTMLButtonElement;
    button?.addEventListener('click', () => this.handleFetch());

    // Bearer token input listener
    const tokenInput = this.container.querySelector('#bearer-token-input') as HTMLInputElement;
    tokenInput?.addEventListener('input', (e) => {
      this.bearerToken = (e.target as HTMLInputElement).value;
      // Store in localStorage for persistence
      if (this.bearerToken) {
        localStorage.setItem('f1_bearer_token', this.bearerToken);
      } else {
        localStorage.removeItem('f1_bearer_token');
      }
    });
    
    // Load token from localStorage on init
    const savedToken = localStorage.getItem('f1_bearer_token');
    if (savedToken && tokenInput) {
      this.bearerToken = savedToken;
      tokenInput.value = savedToken;
    }

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

  private addTerminalLog(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const terminalOutput = this.container.querySelector('#terminal-output') as HTMLElement;
    if (!terminalOutput) return;
    
    const logLine = document.createElement('div');
    logLine.className = `terminal-line terminal-${type}`;
    logLine.textContent = message;
    terminalOutput.appendChild(logLine);
    
    // Auto-scroll to bottom - multiple approaches for reliability
    // 1. Scroll the terminal output itself
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
    
    // 2. Also use scrollIntoView on the new line
    logLine.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    // 3. Double-check after animation frame
    requestAnimationFrame(() => {
      terminalOutput.scrollTop = terminalOutput.scrollHeight;
    });
  }

  private clearTerminal() {
    const terminalOutput = this.container.querySelector('#terminal-output') as HTMLElement;
    terminalOutput.innerHTML = '';
  }

  private setupWebSocketLogListener() {
    // Listen for log messages from the WebSocket
    if ((window as any).wsClient) {
      const wsClient = (window as any).wsClient;
      
      // Add log message handler
      const originalOnMessage = wsClient.ws?.onmessage;
      if (wsClient.ws) {
        wsClient.ws.addEventListener('message', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
              this.addTerminalLog(data.message, data.level === 'error' ? 'error' : 'info');
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      }
    }
  }

  private async handleFetch() {
    const button = this.container.querySelector('#fetch-button') as HTMLButtonElement;
    const messageContainer = this.container.querySelector('#message-container') as HTMLElement;
    const terminalContainer = this.container.querySelector('#terminal-container') as HTMLElement;

    const year = this.selectedYear;
    const round = this.selectedRound;
    const sessionType = this.selectedSession;

    if (!round || !sessionType) {
      messageContainer.innerHTML = '<div class="message error">Please select a Grand Prix and Session first</div>';
      messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    
    // Validate Bearer token is provided
    if (!this.bearerToken || this.bearerToken.trim() === '') {
      messageContainer.innerHTML = '<div class="message error">Please enter a Bearer token for authentication</div>';
      messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    button.disabled = true;
    button.innerHTML = '<span class="loading-spinner"></span>LOADING...';
    messageContainer.innerHTML = '';

    // Show terminal and clear previous logs
    terminalContainer.classList.add('active');
    this.clearTerminal();
    
    // Setup WebSocket listener for Python logs
    this.setupWebSocketLogListener();
    
    // Scroll to terminal after it's visible
    setTimeout(() => {
      terminalContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);

    try {
      this.addTerminalLog('Checking data...', 'info');
      const checkResponse = await fetch(`${API_URL}/check/${year}/${round}/${sessionType}`);
      const checkData = await checkResponse.json();

      let needsFetch = !checkData.exists;

      if (needsFetch) {
        this.addTerminalLog('Fetching from FastF1...', 'info');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.bearerToken) {
          headers['Authorization'] = `Bearer ${this.bearerToken}`;
        }
        const fetchResponse = await fetch(`${API_URL}/fetch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ year, round, sessionType }),
        });

        const fetchData: FetchResponse = await fetchResponse.json();
        if (!fetchData.success) {
          throw new Error(fetchData.error || 'Failed to fetch data');
        }
        this.addTerminalLog('✓ Data fetched successfully', 'success');
      } else {
        this.addTerminalLog('✓ Using cached data', 'success');
      }

      this.addTerminalLog('Loading telemetry...', 'info');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.bearerToken) {
        headers['Authorization'] = `Bearer ${this.bearerToken}`;
      }
      const loadResponse = await fetch(`${API_URL}/load`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ year, round, sessionType }),
      });

      const loadData = await loadResponse.json();

      if (loadData.success) {
        this.addTerminalLog(`✓ Loaded ${loadData.totalFrames.toLocaleString()} frames`, 'success');
        this.addTerminalLog(`✓ ${loadData.drivers.length} drivers loaded`, 'success');
        this.addTerminalLog('Starting visualization...', 'info');
        
        messageContainer.innerHTML = `
          <div class="message success">
            ✓ Data loaded successfully
          </div>
        `;

        // Wait a moment, then initialize visualization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (this.onDataFetched) {
          await this.onDataFetched(year, round, sessionType, loadData.track);
          // Only hide after visualization is fully initialized
          this.container.style.display = 'none';
        }
      } else {
        throw new Error(loadData.error || 'Failed to load data');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.addTerminalLog(`✗ Error: ${errorMessage}`, 'error');
      messageContainer.innerHTML = `<div class="message error">✗ ${errorMessage}</div>`;
      
      // Scroll to error message
      messageContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      // Only re-enable button on error
      button.disabled = false;
      button.textContent = 'LOAD DATA & START';
    }
  }
}

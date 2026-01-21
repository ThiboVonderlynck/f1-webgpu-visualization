import type { PlaybackState } from '../playback/playbackController';
import type { RaceEvent } from '../playback/websocketClient';

export class PlaybackProgress {
  private container: HTMLElement;
  private onSeek: (frame: number) => void;
  
  private progressFill!: HTMLElement;
  private playhead!: HTMLElement;
  private markersContainer!: HTMLElement;
  private tooltip!: HTMLElement;
  
  private totalFrames: number = 0;
  private totalLaps: number = 0;
  private events: RaceEvent[] = [];

  // Controls UI
  private playPauseBtn!: HTMLButtonElement;
  private rewindBtn!: HTMLButtonElement;
  private forwardBtn!: HTMLButtonElement;
  private speedDecreaseBtn!: HTMLButtonElement;
  private speedIncreaseBtn!: HTMLButtonElement;
  private speedDisplay!: HTMLElement;
  private timeDisplay!: HTMLElement;
  private streamingModeSelect!: HTMLSelectElement;
  
  private isDragging: boolean = false;
  private onAction: (action: string, value?: any) => void;
  
  constructor(parent: HTMLElement, onSeek: (frame: number) => void, onAction: (action: string, value?: any) => void) {
    this.container = document.createElement('div');
    this.container.className = 'playback-progress-container';
    this.onSeek = onSeek;
    this.onAction = onAction;
    
    this.render();
    parent.appendChild(this.container);
    this.attachEvents();
    this.initializeControls();
  }
  
  private render() {
    this.container.innerHTML = `
      <div class="integrated-controls">
        <div class="controls-pill">
          <button id="int-rewind" class="int-ctrl-btn" title="Rewind 10s">
            <img src="/images/controls/rewind.png" width="20" height="20">
          </button>
          <button id="int-play-pause" class="int-ctrl-btn main-play" title="Play/Pause">
            <img id="int-play-icon" src="/images/controls/play.png" width="24" height="24">
            <img id="int-pause-icon" src="/images/controls/pause.png" width="24" height="24" style="display:none;">
          </button>
          <button id="int-forward" class="int-ctrl-btn" title="Forward 10s">
            <img src="/images/controls/forward.png" width="20" height="20">
          </button>
          <div class="int-speed-group">
            <button id="int-speed-down" class="int-ctrl-btn small">
              <img src="/images/controls/minus.png" width="12" height="12">
            </button>
            <span id="int-speed-display" class="int-speed-text">1.0x</span>
            <button id="int-speed-up" class="int-ctrl-btn small">
              <img src="/images/controls/plus.png" width="12" height="12">
            </button>
          </div>
          <div class="int-divider"></div>
          <div class="int-mode-group">
            <select id="int-streaming-mode" class="int-mode-select" title="Streaming Mode">
              <option value="replay">Replay (25 FPS)</option>
              <option value="live">Live Sim (270ms)</option>
              <option value="polling">Polling (500ms)</option>
            </select>
          </div>
          <div id="int-time-display" class="int-time-display">00:00 / 00:00</div>
        </div>
      </div>
      <div class="playback-progress-bar">
        <div class="playback-progress-fill"></div>
      </div>
      <div class="markers-container"></div>
      <div class="playhead"></div>
      <div class="playback-tooltip"></div>
      <div class="playback-legend">
        <div class="legend-item">
          <span class="legend-symbol yellow-flag"></span>
          <span class="legend-label">Yellow</span>
        </div>
        <div class="legend-item">
          <span class="legend-symbol red-flag"></span>
          <span class="legend-label">Red</span>
        </div>
        <div class="legend-item">
          <span class="legend-symbol sc-flag"></span>
          <span class="legend-label">Safety Car</span>
        </div>
      </div>
    `;
    
    this.progressFill = this.container.querySelector('.playback-progress-fill') as HTMLElement;
    this.playhead = this.container.querySelector('.playhead') as HTMLElement;
    this.markersContainer = this.container.querySelector('.markers-container') as HTMLElement;
    this.tooltip = this.container.querySelector('.playback-tooltip') as HTMLElement;
    this.speedDisplay = this.container.querySelector('#int-speed-display') as HTMLElement;
    this.timeDisplay = this.container.querySelector('#int-time-display') as HTMLElement;
    this.streamingModeSelect = this.container.querySelector('#int-streaming-mode') as HTMLSelectElement;
    
    // Initialize play/pause button to show play icon (paused state)
    const playIcon = this.container.querySelector('#int-play-icon') as HTMLImageElement;
    const pauseIcon = this.container.querySelector('#int-pause-icon') as HTMLImageElement;
    if (playIcon && pauseIcon) {
      playIcon.style.display = 'inline';
      pauseIcon.style.display = 'none';
    }
  }
  
  private attachEvents() {
    this.container.addEventListener('mousedown', (e) => {
      // Don't start drag if clicking on buttons
      if ((e.target as HTMLElement).closest('.controls-pill')) return;
      
      this.isDragging = true;
      this.handleSeek(e);
      this.container.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const progress = x / rect.width;
        if (progress >= 0 && progress <= 1) {
          const frame = Math.floor(progress * this.totalFrames);
          this.updateTooltip(x, frame);
        } else {
          this.tooltip.style.display = 'none';
        }
        return;
      }
      
      this.handleSeek(e);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.container.classList.remove('dragging');
      }
    });

    // Still keep tooltip update for simple hover
    this.container.addEventListener('mousemove', (e) => {
      if (this.isDragging) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      const frame = Math.floor(progress * this.totalFrames);
      this.updateTooltip(x, frame);
    });
  }

  private handleSeek(e: MouseEvent) {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, x / rect.width));
    this.onSeek(Math.floor(progress * this.totalFrames));
    
    // Also update tooltip while dragging
    const frame = Math.floor(progress * this.totalFrames);
    this.updateTooltip(x, frame);
  }
  
  private updateTooltip(x: number, frame: number) {
    // Find nearest event within 2% of the bar
    const threshold = this.totalFrames * 0.02;
    const nearest = this.events.find(e => Math.abs(e.frame - frame) < threshold);
    
    if (nearest) {
      const typeLabels: Record<string, string> = {
        dnf: 'DNF',
        yellow_flag: 'Yellow Flag',
        red_flag: 'Red Flag',
        safety_car: 'Safety Car',
        vsc: 'Virtual SC'
      };
      
      let text = typeLabels[nearest.type] || 'Event';
      if (nearest.label) text += `: ${nearest.label}`;
      if (nearest.lap) text += ` (Lap ${nearest.lap})`;
      
      this.tooltip.textContent = text;
      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.display = 'block';
    } else {
      this.tooltip.style.display = 'none';
    }
  }
  
  public setRaceData(totalFrames: number, totalLaps: number, events: RaceEvent[] = []) {
    this.totalFrames = totalFrames;
    this.totalLaps = totalLaps;
    this.events = events;
    // Defer drawing to ensure DOM is ready and container has dimensions
    requestAnimationFrame(() => {
      this.drawMarkers();
    });
  }
  
  public setEvents(events: RaceEvent[]) {
    this.events = events;
    this.drawMarkers();
  }

  public addEvent(event: RaceEvent) {
    this.events.push(event);
    this.drawMarkers();
  }
  
  public update(state: PlaybackState) {
    if (this.totalFrames <= 0 && state.totalFrames > 0) {
      this.totalFrames = state.totalFrames;
      this.drawMarkers();
    }
    if (this.totalFrames <= 0) return;
    
    const progress = (state.currentFrame / this.totalFrames) * 100;
    this.progressFill.style.width = `${progress}%`;
    this.playhead.style.left = `${progress}%`;

    // Update play/pause icon
    const playIcon = this.container.querySelector('#int-play-icon') as HTMLImageElement;
    const pauseIcon = this.container.querySelector('#int-pause-icon') as HTMLImageElement;
    if (playIcon && pauseIcon) {
      if (state.isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'inline';
      } else {
        playIcon.style.display = 'inline';
        pauseIcon.style.display = 'none';
      }
    }

    // Update speed
    if (this.speedDisplay) {
      this.speedDisplay.textContent = `${state.speed.toFixed(1)}x`;
    }

    // Update time
    if (this.timeDisplay) {
      const currentTime = Math.floor(state.currentFrame / 25);
      const totalTime = Math.floor(this.totalFrames / 25);
      this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(totalTime)}`;
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private initializeControls() {
    this.playPauseBtn = this.container.querySelector('#int-play-pause') as HTMLButtonElement;
    this.rewindBtn = this.container.querySelector('#int-rewind') as HTMLButtonElement;
    this.forwardBtn = this.container.querySelector('#int-forward') as HTMLButtonElement;
    this.speedDecreaseBtn = this.container.querySelector('#int-speed-down') as HTMLButtonElement;
    this.speedIncreaseBtn = this.container.querySelector('#int-speed-up') as HTMLButtonElement;

    this.playPauseBtn.onclick = () => this.onAction('togglePlay');
    this.rewindBtn.onclick = () => this.onAction('seekRelative', -250); // -10s
    this.forwardBtn.onclick = () => this.onAction('seekRelative', 250); // +10s
    this.speedDecreaseBtn.onclick = () => this.onAction('changeSpeed', -1);
    this.speedIncreaseBtn.onclick = () => this.onAction('changeSpeed', 1);
    this.streamingModeSelect.onchange = () => this.onAction('changeStreamingMode', this.streamingModeSelect.value);
  }
  
  public drawMarkers(events?: RaceEvent[]) {
    if (events) this.events = events;
    if (this.totalFrames <= 0) {
      return;
    }
    this.markersContainer.innerHTML = '';
    
    // Draw Lap Markers
    if (this.totalLaps > 1) {
      for (let lap = 1; lap <= this.totalLaps; lap++) {
        const lapProgress = (lap / this.totalLaps) * 100;
        
        const line = document.createElement('div');
        line.className = 'lap-marker';
        line.style.left = `${lapProgress}%`;
        
        if (lap === 1 || lap === this.totalLaps || lap % 10 === 0) {
          const num = document.createElement('div');
          num.className = 'lap-number';
          num.textContent = lap.toString();
          num.style.left = `${lapProgress}%`;
          this.markersContainer.appendChild(num);
        }
        
        this.markersContainer.appendChild(line);
      }
    }
    
    // Draw Events
    const containerWidth = this.markersContainer.clientWidth || 1000;
    const minWidthPercent = (4 / containerWidth) * 100; // Minimum 4px width
    
    this.events.forEach((event) => {
      const startProgress = (event.frame / this.totalFrames) * 100;
      
      if (event.type === 'dnf') {
        const marker = document.createElement('div');
        marker.className = 'event-marker dnf';
        marker.style.left = `${startProgress}%`;
        marker.textContent = '×';
        this.markersContainer.appendChild(marker);
      } else {
        const endFrame = event.endFrame || event.frame;
        const endProgress = (Math.min(endFrame, this.totalFrames) / this.totalFrames) * 100;
        
        // Minimum segment width of 4px for visibility
        const width = Math.max(minWidthPercent, endProgress - startProgress);
        
        const segment = document.createElement('div');
        segment.className = `flag-segment ${this.getFlagClass(event.type)}`;
        segment.style.left = `${startProgress}%`;
        segment.style.width = `${width}%`;
        this.markersContainer.appendChild(segment);
      }
    });
  }
  
  private getFlagClass(type: string): string {
    switch (type) {
      case 'yellow_flag': return 'yellow';
      case 'red_flag': return 'red';
      case 'safety_car': 
      case 'vsc': return 'sc';  // Both SC and VSC use same color
      default: return '';
    }
  }

  public toggleVisibility() {
    const isVisible = this.container.style.display !== 'none';
    this.container.style.display = isVisible ? 'none' : 'block';
  }

  public clear() {
    this.events = [];
    this.drawMarkers();
  }
}

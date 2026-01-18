import type { TelemetryFrame } from '../playback/websocketClient';
import { getTeamLogoPath, getTeamColorClass } from './teamMapping.js';

interface LeaderboardEntry {
  code: string;
  color: [number, number, number];
  position: number;
  progress_m: number;
  lap: number;
  tyre: number;
  drs: number;
  speed: number;
  isOut: boolean;
  pitState: PitState;
  gap?: string;
}

interface ProjectionResult {
  distanceAlong: number;  // Distance along the track (progress)
  distanceFrom: number;   // Distance from the track centerline
}

// Pit lane state machine
type PitState = 'NONE' | 'IN_PIT' | 'PIT_EXIT';

export class Leaderboard {
  private container: HTMLElement;
  private entries: LeaderboardEntry[] = [];
  private driverColors: { [code: string]: [number, number, number] } = {};
  private totalLaps: number = 0;
  private currentLap: number = 0;
  private entryElements: Map<string, HTMLElement> = new Map();
  private selectedCode: string | null = null;
  
  // Pit state tracking per driver
  private driverPitState: Map<string, PitState> = new Map();
  private driverHadPitStop: Map<string, boolean> = new Map(); // Tracks if driver stopped (speed ~0)
  
  // POV camera callback
  private onDriverSelectCallback?: (code: string) => void;

  // Reference polyline for position projection
  private _ref_xs: Float32Array = new Float32Array(0);
  private _ref_ys: Float32Array = new Float32Array(0);
  private _ref_cumdist: Float32Array = new Float32Array(0);
  private _ref_total_length: number = 0.0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  setTrackCenterline(centerline: { x: number[]; y: number[] }): void {
    const ref_points = this._interpolatePoints(centerline.x, centerline.y, 4000);

    this._ref_xs = new Float32Array(ref_points.map((p) => p[0]));
    this._ref_ys = new Float32Array(ref_points.map((p) => p[1]));

    // Calculate cumulative distances
    const diffs: number[] = [];
    for (let i = 0; i < this._ref_xs.length - 1; i++) {
      const dx = this._ref_xs[i + 1] - this._ref_xs[i];
      const dy = this._ref_ys[i + 1] - this._ref_ys[i];
      diffs.push(Math.sqrt(dx * dx + dy * dy));
    }

    const cumdist = [0.0];
    let sum = 0.0;
    for (const diff of diffs) {
      sum += diff;
      cumdist.push(sum);
    }

    this._ref_cumdist = new Float32Array(cumdist);
    this._ref_total_length = this._ref_cumdist.length > 0 ? this._ref_cumdist[this._ref_cumdist.length - 1] : 0.0;

    console.log(`✓ Leaderboard reference track loaded: ${this._ref_total_length.toFixed(2)}m`);
  }

  private _interpolatePoints(xs: number[], ys: number[], interp_points: number = 2000): [number, number][] {
    const n = xs.length;
    const t_old = Array.from({ length: n }, (_, i) => i / (n - 1));
    const t_new = Array.from({ length: interp_points }, (_, i) => i / (interp_points - 1));

    const xs_i = t_new.map((t) => this._interp(t, t_old, xs));
    const ys_i = t_new.map((t) => this._interp(t, t_old, ys));

    return xs_i.map((x, i) => [x, ys_i[i]]);
  }

  private _interp(x: number, xp: number[], fp: number[]): number {
    if (x <= xp[0]) return fp[0];
    if (x >= xp[xp.length - 1]) return fp[fp.length - 1];

    for (let i = 0; i < xp.length - 1; i++) {
      if (x >= xp[i] && x <= xp[i + 1]) {
        const t = (x - xp[i]) / (xp[i + 1] - xp[i]);
        return fp[i] + t * (fp[i + 1] - fp[i]);
      }
    }
    return fp[fp.length - 1];
  }

  private _projectToReference(x: number, y: number): ProjectionResult {
    if (this._ref_total_length === 0.0) {
      return { distanceAlong: 0.0, distanceFrom: 0.0 };
    }

    // Find nearest point on track
    let min_d2 = Infinity;
    let idx = 0;
    for (let i = 0; i < this._ref_xs.length; i++) {
      const dx = this._ref_xs[i] - x;
      const dy = this._ref_ys[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < min_d2) {
        min_d2 = d2;
        idx = i;
      }
    }

    // Project onto adjacent segment for better accuracy
    let distanceAlong = this._ref_cumdist[idx];
    let distanceFrom = Math.sqrt(min_d2);

    if (idx < this._ref_xs.length - 1) {
      const x1 = this._ref_xs[idx];
      const y1 = this._ref_ys[idx];
      const x2 = this._ref_xs[idx + 1];
      const y2 = this._ref_ys[idx + 1];
      const vx = x2 - x1;
      const vy = y2 - y1;
      const seg_len2 = vx * vx + vy * vy;

      if (seg_len2 > 0) {
        let t = ((x - x1) * vx + (y - y1) * vy) / seg_len2;
        t = Math.max(0.0, Math.min(1.0, t));
        const proj_x = x1 + t * vx;
        const proj_y = y1 + t * vy;
        
        // Calculate distance along track
        const seg_dist = Math.sqrt((proj_x - x1) ** 2 + (proj_y - y1) ** 2);
        distanceAlong = this._ref_cumdist[idx] + seg_dist;
        
        // Calculate perpendicular distance from track centerline
        distanceFrom = Math.sqrt((x - proj_x) ** 2 + (y - proj_y) ** 2);
      }
    }

    return { distanceAlong, distanceFrom };
  }

  // Pit lane detection constants
  // Distance: Pit lane is typically 25-30m from racing line, grid positions only 5-15m
  // Speed: Cars in pit lane move at 60-80 km/h
  private static readonly PIT_LANE_DISTANCE_THRESHOLD = 25; // meters from racing line
  private static readonly PIT_LANE_SPEED_MAX = 85; // km/h (pit lane limit + buffer)
  private static readonly PIT_LANE_SPEED_MIN = 30; // km/h (must be moving, not on grid)
  private static readonly PIT_STOP_SPEED = 5; // km/h (considered stationary for pit stop)
  private static readonly PIT_EXIT_SPEED_THRESHOLD = 90; // km/h (accelerating out of pit)

  /**
   * State machine for pit lane detection:
   * NONE → IN_PIT: Car enters pit lane (far from centerline, pit lane speed)
   * IN_PIT → tracks when speed drops to ~0 (pit stop happening)
   * After pit stop → PIT_EXIT: Car starts moving again at pit lane speed
   * PIT_EXIT → NONE: Car accelerates above pit lane speed (rejoining track)
   */
  private updateDriverPitState(code: string, distanceFromTrack: number, speed: number): PitState {
    const currentState = this.driverPitState.get(code) || 'NONE';
    const hadPitStop = this.driverHadPitStop.get(code) || false;
    
    const isInPitLaneArea = distanceFromTrack > Leaderboard.PIT_LANE_DISTANCE_THRESHOLD;
    const isAtPitLaneSpeed = speed < Leaderboard.PIT_LANE_SPEED_MAX && speed > Leaderboard.PIT_LANE_SPEED_MIN;
    const isStopped = speed < Leaderboard.PIT_STOP_SPEED;
    const isAccelerating = speed > Leaderboard.PIT_EXIT_SPEED_THRESHOLD;
    
    let newState: PitState = currentState;
    
    switch (currentState) {
      case 'NONE':
        // Enter pit lane: far from track AND at pit lane speed
        if (isInPitLaneArea && isAtPitLaneSpeed) {
          newState = 'IN_PIT';
          this.driverHadPitStop.set(code, false);
        }
        break;
        
      case 'IN_PIT':
        // Track if car has stopped (pit stop is happening)
        if (isStopped) {
          this.driverHadPitStop.set(code, true);
        }
        
        // Transition to PIT_EXIT after pit stop and car starts moving again
        if (hadPitStop && isAtPitLaneSpeed) {
          newState = 'PIT_EXIT';
        }
        
        // If car somehow left pit area without stopping (aborted pit?)
        if (!isInPitLaneArea && !isStopped) {
          newState = 'NONE';
          this.driverHadPitStop.set(code, false);
        }
        break;
        
      case 'PIT_EXIT':
        // Exit pit lane: car accelerates above pit lane speed
        if (isAccelerating || !isInPitLaneArea) {
          newState = 'NONE';
          this.driverHadPitStop.set(code, false);
        }
        break;
    }
    
    this.driverPitState.set(code, newState);
    return newState;
  }

  setDriverColors(colors: { [code: string]: [number, number, number] }): void {
    this.driverColors = colors;
  }

  setTotalLaps(laps: number): void {
    this.totalLaps = laps;
    this.updateLapCounter();
  }

  /**
   * Reset all entry elements to force re-render with updated team data
   */
  resetEntries(): void {
    for (const element of this.entryElements.values()) {
      delete element.dataset.initialized;
    }
  }

  private updateLapCounter(): void {
    const lapCounterEl = this.container.querySelector('.lap-counter');
    if (lapCounterEl) {
      lapCounterEl.innerHTML = `<span class="lap-label">LAP </span><span class="lap-current">${this.currentLap}</span><span class="lap-total">/ ${this.totalLaps}</span>`;
    }
  }

  private updateFlagBanner(trackStatus: string | undefined): void {
    const banner = this.container.querySelector('.race-flag-banner') as HTMLElement;
    if (!banner) return;
    
    // Status codes: 1=Clear, 2=Yellow, 4=SC, 5=Red, 6/7=VSC
    const status = trackStatus || '1';
    
    if (status === '1') {
      // All clear - hide banner
      banner.classList.remove('visible');
      return;
    }
    
    // Determine flag type and text
    let flagHtml = '';
    let flagClass = '';
    
    switch (status) {
      case '2':
        flagHtml = 'YELLOW FLAG';
        flagClass = 'yellow';
        break;
      case '4':
        flagHtml = '<img src="/images/logos/FIA.svg" alt="FIA" class="flag-logo" />SAFETY CAR';
        flagClass = 'safety-car';
        break;
      case '5':
        flagHtml = 'RED FLAG';
        flagClass = 'red';
        break;
      case '6':
      case '7':
        flagHtml = 'VIRTUAL SAFETY CAR';
        flagClass = 'vsc';
        break;
      default:
        banner.classList.remove('visible');
        return;
    }
    
    // Update banner
    banner.innerHTML = flagHtml;
    banner.className = `race-flag-banner ${flagClass} visible`;
  }

  updateFromFrame(frame: TelemetryFrame): void {
    const driver_progress: { [code: string]: { progress_m: number; distanceFrom: number } } = {};

    for (const [code, pos] of Object.entries(frame.drivers)) {
      let lap: number;
      try {
        lap = parseInt(String(pos.lap || 1));
      } catch {
        lap = 1;
      }

      const projection = this._projectToReference(pos.x || 0.0, pos.y || 0.0);

      // Fix for start-line wrap-around
      const telemetry_dist = pos.dist || 0.0;
      let corrected_projected_m = projection.distanceAlong;
      if (lap === 1 && telemetry_dist < this._ref_total_length * 0.5 && projection.distanceAlong > this._ref_total_length * 0.5) {
        corrected_projected_m = projection.distanceAlong - this._ref_total_length;
      }

      const progress_m = (Math.max(lap, 1) - 1) * this._ref_total_length + corrected_projected_m;

      driver_progress[code] = { progress_m, distanceFrom: projection.distanceFrom };
    }

    const entries: LeaderboardEntry[] = [];
    for (const [code, pos] of Object.entries(frame.drivers)) {
      const color = this.driverColors[code] || [255, 255, 255];
      const { progress_m, distanceFrom } = driver_progress[code];
      const speed = pos.speed || 0;
      
      // Update pit state machine for this driver
      const pitState = this.updateDriverPitState(code, distanceFrom, speed);

      entries.push({
        code,
        color,
        position: pos.position,
        progress_m: progress_m,
        lap: pos.lap,
        tyre: pos.tyre,
        drs: pos.drs,
        speed: speed,
        isOut: pos.rel_dist === 1,
        pitState: pitState,
      });
    }

    entries.sort((a, b) => b.progress_m - a.progress_m);

    this.entries = entries;
    
    if (entries.length > 0) {
      this.currentLap = entries[0].lap;
      this.updateLapCounter();
    }
    
    // Update flag banner
    this.updateFlagBanner(frame.track_status);
    
    this.updateDOM();
  }

  private getTyreCompound(tyreCode: number): string {
    const compounds: { [key: number]: string } = {
      0: 'SOFT',
      1: 'MEDIUM',
      2: 'HARD',
      3: 'INTERMEDIATE',
      4: 'WET',
      5: 'UNKNOWN',
      6: 'TEST_UNKNOWN',
    };
    return compounds[tyreCode] || 'UNKNOWN';
  }

  private getTyreImagePath(tyreCode: number): string {
    const images: { [key: number]: string } = {
      0: '/images/tyres/Soft.svg',
      1: '/images/tyres/Medium.svg',
      2: '/images/tyres/Hard.svg',
      3: '/images/tyres/Inters.svg',
      4: '/images/tyres/Wets.svg',
    };
    return images[tyreCode] || '/images/tyres/Hard.svg';
  }

  private updateDOM(): void {
    const leaderboardEl = this.container.querySelector('.leaderboard-entries') as HTMLElement;
    if (!leaderboardEl) return;

    const entryHeight = 28;
    leaderboardEl.style.height = `${this.entries.length * entryHeight}px`;

    this.entries.forEach((entry, index) => {
      let entryEl = this.entryElements.get(entry.code);

      if (!entryEl) {
        entryEl = document.createElement('div');
        entryEl.className = 'leaderboard-entry';
        entryEl.dataset.code = entry.code;
        leaderboardEl.appendChild(entryEl);
        this.entryElements.set(entry.code, entryEl);
        
        // Add click handler for POV camera
        entryEl.addEventListener('click', () => {
          if (this.onDriverSelectCallback) {
            this.onDriverSelectCallback(entry.code);
          }
        });
        entryEl.style.cursor = 'pointer';
      }

      entryEl.style.transform = `translateY(${index * entryHeight}px)`;

      const tyreName = this.getTyreCompound(entry.tyre);
      const tyreImagePath = this.getTyreImagePath(entry.tyre);
      const isDrsActive = entry.drs >= 10;
      const teamLogoPath = getTeamLogoPath(entry.code);
      const teamColorClass = getTeamColorClass(entry.code);

      const isSelected = entry.code === this.selectedCode;
      const isLeader = index === 0;
      entryEl.className = `leaderboard-entry ${entry.isOut ? 'out' : ''} ${isSelected ? 'selected' : ''} ${isLeader ? 'leader' : ''}`;
      
      entryEl.style.setProperty('--driver-rgb', `${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]}`);
      
      // Build the expected innerHTML
      const expectedHTML = `
        <div class="driver-left">
          <div class="position">${index + 1}</div>
          <span class="team-color-line ${teamColorClass}"></span>
          ${teamLogoPath ? `<img src="${teamLogoPath}" alt="${entry.code} team" class="team-logo" />` : ''}
          <div class="driver-code">
            ${entry.code}
          </div>
        </div>
        <div class="driver-right">
          <span class="pit-label" 
                data-state="${entry.pitState}"
                style="color: rgb(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]})">
          </span>
          <div class="indicators">
            <div class="drs-indicator ${isDrsActive ? 'active' : ''}" 
                 title="DRS ${isDrsActive ? 'Active' : 'Inactive'}">
            </div>
            <img src="${tyreImagePath}" 
                 alt="${tyreName}"
                 class="tyre-indicator"
                 title="${tyreName}" />
          </div>
        </div>
      `;
      
      // Only update innerHTML if it's the first time or structure changed
      if (!entryEl.dataset.initialized) {
        entryEl.innerHTML = expectedHTML;
        entryEl.dataset.initialized = 'true';
      }
      
      // Update dynamic elements separately to preserve transitions
      const pitLabel = entryEl.querySelector('.pit-label') as HTMLElement;
      if (pitLabel) {
        const previousState = pitLabel.dataset.state as PitState || 'NONE';
        const currentState = entry.pitState;
        
        // Update color
        pitLabel.style.color = `rgb(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]})`;
        
        // Handle state transitions with fade effects
        if (previousState !== currentState) {
          // State has changed - need to handle transition
          
          if (currentState === 'NONE') {
            // Fading out (PIT_EXIT → NONE or IN_PIT → NONE)
            pitLabel.classList.remove('visible');
            // Clear text after fade completes
            setTimeout(() => {
              if (pitLabel.dataset.state === 'NONE') {
                pitLabel.textContent = '';
              }
            }, 300); // Match CSS transition duration
          } else if (previousState === 'NONE') {
            // Fading in (NONE → IN_PIT or NONE → PIT_EXIT)
            const newText = currentState === 'IN_PIT' ? 'IN PIT' : 'PIT EXIT';
            pitLabel.textContent = newText;
            // Trigger reflow to ensure transition works
            pitLabel.offsetHeight;
            pitLabel.classList.add('visible');
          } else {
            // Text is changing (IN_PIT → PIT_EXIT or PIT_EXIT → IN_PIT)
            // Fade out, change text, fade in
            pitLabel.classList.remove('visible');
            setTimeout(() => {
              const newText = currentState === 'IN_PIT' ? 'IN PIT' : 'PIT EXIT';
              pitLabel.textContent = newText;
              pitLabel.dataset.state = currentState;
              // Trigger reflow
              pitLabel.offsetHeight;
              pitLabel.classList.add('visible');
            }, 300); // Match CSS transition duration
          }
        }
        
        // Update state tracking
        pitLabel.dataset.state = currentState;
      }
      
      // Handle OUT status - show in pit-label area
      if (entry.isOut) {
        if (pitLabel.textContent !== 'OUT') {
          pitLabel.textContent = 'OUT';
          pitLabel.style.color = 'rgba(255, 255, 255, 0.7)';  // White 70%
          pitLabel.classList.add('visible');
        }
      } else if (pitLabel.textContent === 'OUT') {
        // Clear OUT status if driver is back (shouldn't happen often)
        pitLabel.classList.remove('visible');
        pitLabel.textContent = '';
      }
      
      // Update position number
      const positionEl = entryEl.querySelector('.position');
      if (positionEl) {
        positionEl.textContent = `${index + 1}`;
      }
      
      // Update DRS indicator
      const drsIndicator = entryEl.querySelector('.drs-indicator');
      if (drsIndicator) {
        if (isDrsActive) {
          drsIndicator.classList.add('active');
        } else {
          drsIndicator.classList.remove('active');
        }
      }
      
      // Update tyre indicator
      const tyreIndicator = entryEl.querySelector('.tyre-indicator') as HTMLImageElement;
      if (tyreIndicator && tyreIndicator.src !== tyreImagePath) {
        tyreIndicator.src = tyreImagePath;
        tyreIndicator.alt = tyreName;
        tyreIndicator.title = tyreName;
      }
    });

    const currentCodes = new Set(this.entries.map(e => e.code));
    for (const [code, element] of this.entryElements.entries()) {
      if (!currentCodes.has(code)) {
        element.remove();
        this.entryElements.delete(code);
      }
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="leaderboard">
        <div class="leaderboard-header">
          <img src="/images/logos/F1.svg" alt="F1" class="f1-logo" />
        </div>
        <div class="lap-counter"><span class="lap-label">LAP </span><span class="lap-current">0</span><span class="lap-total">/ 0</span></div>
        <div class="race-flag-banner"></div>
        <div class="leaderboard-entries"></div>
      </div>
    `;
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  /**
   * Set the currently selected driver for POV camera highlighting
   */
  setSelectedDriver(code: string | null): void {
    const previousSelected = this.selectedCode;
    this.selectedCode = code;
    
    // Immediately update classes if entry elements exist to avoid waiting for next frame
    if (previousSelected) {
      const prevEl = this.entryElements.get(previousSelected);
      if (prevEl) prevEl.classList.remove('selected');
    }
    
    if (code) {
      const currEl = this.entryElements.get(code);
      if (currEl) {
        currEl.classList.add('selected');
      }
    }
  }

  /**
   * Set callback for when a driver is clicked (for POV camera)
   */
  onDriverSelect(callback: (code: string) => void): void {
    this.onDriverSelectCallback = callback;
  }
}

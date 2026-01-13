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
  isOut: boolean;
  gap?: string;
}

export class Leaderboard {
  private container: HTMLElement;
  private entries: LeaderboardEntry[] = [];
  private driverColors: { [code: string]: [number, number, number] } = {};
  private totalLaps: number = 0;
  private currentLap: number = 0;
  private entryElements: Map<string, HTMLElement> = new Map();

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

  private _projectToReference(x: number, y: number): number {
    if (this._ref_total_length === 0.0) {
      return 0.0;
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
        const seg_dist = Math.sqrt((proj_x - x1) ** 2 + (proj_y - y1) ** 2);
        return this._ref_cumdist[idx] + seg_dist;
      }
    }

    return this._ref_cumdist[idx];
  }

  setDriverColors(colors: { [code: string]: [number, number, number] }): void {
    this.driverColors = colors;
  }

  setTotalLaps(laps: number): void {
    this.totalLaps = laps;
    this.updateLapCounter();
  }

  private updateLapCounter(): void {
    const lapCounterEl = this.container.querySelector('.lap-counter');
    if (lapCounterEl) {
      lapCounterEl.textContent = `LAP ${this.currentLap} / ${this.totalLaps}`;
    }
  }

  updateFromFrame(frame: TelemetryFrame): void {
    const driver_progress: { [code: string]: number } = {};

    for (const [code, pos] of Object.entries(frame.drivers)) {
      let lap: number;
      try {
        lap = parseInt(String(pos.lap || 1));
      } catch {
        lap = 1;
      }

      const projected_m = this._projectToReference(pos.x || 0.0, pos.y || 0.0);

      // Fix for start-line wrap-around
      const telemetry_dist = pos.dist || 0.0;
      let corrected_projected_m = projected_m;
      if (lap === 1 && telemetry_dist < this._ref_total_length * 0.5 && projected_m > this._ref_total_length * 0.5) {
        corrected_projected_m = projected_m - this._ref_total_length;
      }

      const progress_m = (Math.max(lap, 1) - 1) * this._ref_total_length + corrected_projected_m;

      driver_progress[code] = progress_m;
    }

    const entries: LeaderboardEntry[] = [];
    for (const [code, pos] of Object.entries(frame.drivers)) {
      const color = this.driverColors[code] || [255, 255, 255];
      const progress_m = driver_progress[code];

      entries.push({
        code,
        color,
        position: pos.position,
        progress_m: progress_m,
        lap: pos.lap,
        tyre: pos.tyre,
        drs: pos.drs,
        isOut: pos.rel_dist === 1,
      });
    }

    entries.sort((a, b) => b.progress_m - a.progress_m);

    this.entries = entries;
    
    if (entries.length > 0) {
      this.currentLap = entries[0].lap;
      this.updateLapCounter();
    }
    
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
      }

      entryEl.style.transform = `translateY(${index * entryHeight}px)`;

      const tyreName = this.getTyreCompound(entry.tyre);
      const tyreImagePath = this.getTyreImagePath(entry.tyre);
      const isDrsActive = entry.drs >= 10;
      const teamLogoPath = getTeamLogoPath(entry.code);
      const teamColorClass = getTeamColorClass(entry.code);

      entryEl.className = `leaderboard-entry ${entry.isOut ? 'out' : ''}`;
      
      entryEl.innerHTML = `
        <div class="driver-left">
          <div class="position">${index + 1}</div>
          <span class="team-color-line ${teamColorClass}"></span>
          ${teamLogoPath ? `<img src="${teamLogoPath}" alt="${entry.code} team" class="team-logo" />` : ''}
          <div class="driver-code">
            ${entry.code}
            ${entry.isOut ? '<span class="out-label">OUT</span>' : ''}
          </div>
        </div>
        <div class="driver-right">
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
        <div class="lap-counter">LAP 0 / 0</div>
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
}

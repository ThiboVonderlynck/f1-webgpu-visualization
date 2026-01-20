import type { TelemetryFrame, QualifyingMetadata, QualifyingResult } from '../playback/websocketClient';
import { getTeamLogoPath, getTeamColorClass } from './teamMapping.js';

type SessionMode = 'race' | 'qualifying';

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
  // Qualifying-specific fields
  q1Time?: string | null;
  q2Time?: string | null;
  q3Time?: string | null;
  eliminatedIn?: 'Q1' | 'Q2' | null;
  isInDangerZone?: boolean;
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

  // Qualifying mode support
  private sessionMode: SessionMode = 'race';
  private qualifyingData: QualifyingMetadata | null = null;
  private currentPhase: 'Q1' | 'Q2' | 'Q3' = 'Q1';
  private qualifyingResultsMap: Map<string, QualifyingResult> = new Map();
  private isSprintQualifying: boolean = false;
  
  // Live qualifying state (calculated from lap events up to current time)
  private liveQualifyingState: Map<string, {
    bestTime: number | null;  // Best lap time in ms
    bestTimeStr: string | null;
    eliminated: boolean;
    eliminatedIn: 'Q1' | 'Q2' | null;
  }> = new Map();
  private q1EliminatedDrivers: Set<string> = new Set();
  private q2EliminatedDrivers: Set<string> = new Set();

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  /**
   * Set the session mode (race or qualifying)
   */
  setSessionMode(mode: SessionMode): void {
    this.sessionMode = mode;
    this.render(); // Re-render with appropriate layout
    this.resetEntries();
  }

  /**
   * Set qualifying metadata for TV-like display
   * @param data - The qualifying metadata from the API
   * @param isSprint - If true, display as Sprint Qualifying (SQ1/SQ2/SQ3)
   */
  setQualifyingData(data: QualifyingMetadata, isSprint: boolean = false): void {
    this.qualifyingData = data;
    this.sessionMode = 'qualifying';
    this.isSprintQualifying = isSprint;
    
    // Reset all live qualifying state - IMPORTANT: start fresh!
    this.q1EliminatedDrivers.clear();
    this.q2EliminatedDrivers.clear();
    this.liveQualifyingState.clear();
    this.currentPhase = 'Q1';
    
    // Build lookup map for quick access (static final results, for reference only)
    this.qualifyingResultsMap.clear();
    for (const result of data.results) {
      this.qualifyingResultsMap.set(result.abbreviation, result);
    }
    
    this.render();
    this.resetEntries();
  }

  /**
   * Set current qualifying phase (Q1, Q2, Q3)
   */
  setQualifyingPhase(phase: 'Q1' | 'Q2' | 'Q3'): void {
    this.currentPhase = phase;
    this.updatePhaseIndicator();
  }

  /**
   * Get elimination zone positions for current phase
   */
  private getEliminationZone(): number[] {
    if (this.currentPhase === 'Q1') return [16, 17, 18, 19, 20];
    if (this.currentPhase === 'Q2') return [11, 12, 13, 14, 15];
    return []; // Q3 has no elimination
  }

  private updatePhaseIndicator(): void {
    const phaseEl = this.container.querySelector('.quali-phase');
    if (phaseEl) {
      // Display SQ1/SQ2/SQ3 for Sprint Qualifying, Q1/Q2/Q3 for regular
      const displayPhase = this.isSprintQualifying ? `S${this.currentPhase}` : this.currentPhase;
      phaseEl.textContent = displayPhase;
      phaseEl.className = `quali-phase ${this.currentPhase.toLowerCase()}`;
    }
  }

  /**
   * Update the qualifying countdown timer
   */
  private updateQualiTimer(sessionTimeMs: number): void {
    const timerEl = this.container.querySelector('.quali-timer');
    if (!timerEl || !this.qualifyingData) return;

    // Find current phase timing
    const currentPhaseData = this.qualifyingData.session_phases.find(p => p.name === this.currentPhase);
    if (!currentPhaseData) {
      timerEl.textContent = '--:--';
      return;
    }

    // Calculate remaining time in the current phase
    let remainingMs: number;
    
    if (sessionTimeMs < currentPhaseData.start_ms) {
      // Before phase starts - show full duration
      remainingMs = currentPhaseData.end_ms - currentPhaseData.start_ms;
    } else if (sessionTimeMs >= currentPhaseData.end_ms) {
      // Phase ended
      remainingMs = 0;
    } else {
      // During phase - calculate remaining
      remainingMs = currentPhaseData.end_ms - sessionTimeMs;
    }

    // Format as MM:SS
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Add styling classes based on time remaining
    timerEl.classList.remove('warning', 'ended');
    if (totalSeconds === 0) {
      timerEl.classList.add('ended');
    } else if (totalSeconds <= 60) {
      timerEl.classList.add('warning');
    }
  }

  /**
   * Update live qualifying state based on current session time
   * This calculates standings from lap events that have occurred up to this point
   */
  updateQualifyingTime(sessionTimeMs: number): void {
    if (!this.qualifyingData || this.sessionMode !== 'qualifying') return;
    
    // Determine current phase based on session time
    let newPhase: 'Q1' | 'Q2' | 'Q3' = 'Q1';
    
    const q1Phase = this.qualifyingData.session_phases.find(p => p.name === 'Q1');
    if (q1Phase && sessionTimeMs < q1Phase.start_ms) {
      // We're before Q1 has started
      newPhase = 'Q1';
    } else {
      for (const phase of this.qualifyingData.session_phases) {
        if (sessionTimeMs >= phase.start_ms && sessionTimeMs <= phase.end_ms) {
          newPhase = phase.name;
          break;
        } else if (sessionTimeMs > phase.end_ms) {
          newPhase = phase.name; // We're past this phase
        }
      }
    }
    
    // Update phase indicator if changed
    if (newPhase !== this.currentPhase) {
      this.currentPhase = newPhase;
      this.updatePhaseIndicator();
    }
    
    // Update the countdown timer
    this.updateQualiTimer(sessionTimeMs);
    
    // Check for eliminations - use phase START times as the trigger
    // Q1 eliminations happen when Q2 starts (all Q1 laps are done by then)
    // Q2 eliminations happen when Q3 starts
    const q2Start = this.qualifyingData.session_phases.find(p => p.name === 'Q2')?.start_ms || Infinity;
    const q3Start = this.qualifyingData.session_phases.find(p => p.name === 'Q3')?.start_ms || Infinity;
    
    // Q1 eliminations: calculate when Q2 starts (all Q1 laps complete by then)
    if (sessionTimeMs >= q2Start && this.q1EliminatedDrivers.size === 0) {
      this.calculateQ1Eliminations();
    }
    
    // Q2 eliminations: calculate when Q3 starts
    if (sessionTimeMs >= q3Start && this.q2EliminatedDrivers.size === 0) {
      this.calculateQ2Eliminations();
    }
    
    // If user seeks backward before Q2 start, clear Q1 eliminations
    if (sessionTimeMs < q2Start && this.q1EliminatedDrivers.size > 0) {
      this.q1EliminatedDrivers.clear();
    }
    
    // If user seeks backward before Q3 start, clear Q2 eliminations
    if (sessionTimeMs < q3Start && this.q2EliminatedDrivers.size > 0) {
      this.q2EliminatedDrivers.clear();
    }
    
    // Calculate live standings from lap events up to current time
    this.calculateLiveStandings(sessionTimeMs);
  }

  /**
   * Calculate live standings based on lap events up to the current time
   * Each phase (Q1/Q2/Q3) tracks its own best time - this matches how F1 officially works
   */
  private calculateLiveStandings(sessionTimeMs: number): void {
    if (!this.qualifyingData) return;
    
    // Determine phase boundaries
    const q2Start = this.qualifyingData.session_phases.find(p => p.name === 'Q2')?.start_ms || Infinity;
    const q3Start = this.qualifyingData.session_phases.find(p => p.name === 'Q3')?.start_ms || Infinity;
    
    // Determine current phase
    let currentPhaseName: 'Q1' | 'Q2' | 'Q3' = 'Q1';
    if (sessionTimeMs >= q3Start) {
      currentPhaseName = 'Q3';
    } else if (sessionTimeMs >= q2Start) {
      currentPhaseName = 'Q2';
    }
    
    // Reset live state
    this.liveQualifyingState.clear();
    
    // For each driver, calculate their best time FOR THE CURRENT PHASE
    for (const result of this.qualifyingData.results) {
      let bestTime: number | null = null;
      let bestTimeStr: string | null = null;
      
      const isQ1Eliminated = this.q1EliminatedDrivers.has(result.abbreviation);
      const isQ2Eliminated = this.q2EliminatedDrivers.has(result.abbreviation);
      const isEliminated = isQ1Eliminated || isQ2Eliminated;
      
      // Process lap events for this driver
      for (const lap of this.qualifyingData.lap_events) {
        if (lap.driver !== result.abbreviation || lap.deleted) continue;
        if (lap.time_ms > sessionTimeMs) continue; // Lap not completed yet
        
        // Determine which phase this lap belongs to
        const isQ1Lap = lap.time_ms < q2Start;
        const isQ2Lap = lap.time_ms >= q2Start && lap.time_ms < q3Start;
        const isQ3Lap = lap.time_ms >= q3Start;
        
        // Only count laps from the CURRENT phase (matching how F1 qualifying works)
        // Q1 standings show Q1 times only
        // Q2 standings show Q2 times only (for drivers who made it through Q1)
        // Q3 standings show Q3 times only (for drivers who made it through Q2)
        
        if (currentPhaseName === 'Q1' && isQ1Lap) {
          if (bestTime === null || lap.lap_time_ms < bestTime) {
            bestTime = lap.lap_time_ms;
            bestTimeStr = lap.lap_time;
          }
        } else if (currentPhaseName === 'Q2') {
          if (isQ1Eliminated) {
            // Eliminated drivers keep their Q1 time for display
            if (isQ1Lap) {
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            }
          } else {
            // Active drivers: show Q2 times if available, otherwise Q1 times
            if (isQ2Lap) {
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            } else if (isQ1Lap && bestTime === null) {
              // Fall back to Q1 time only if no Q2 time yet
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            }
          }
        } else if (currentPhaseName === 'Q3') {
          if (isQ1Eliminated || isQ2Eliminated) {
            // Eliminated drivers keep their best time from when they were eliminated
            if (isQ1Eliminated && isQ1Lap) {
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            } else if (isQ2Eliminated && (isQ1Lap || isQ2Lap)) {
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            }
          } else {
            // Q3 drivers: show Q3 times if available, otherwise Q2 times
            if (isQ3Lap) {
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            } else if ((isQ1Lap || isQ2Lap) && bestTime === null) {
              // Fall back to earlier times only if no Q3 time yet
              if (bestTime === null || lap.lap_time_ms < bestTime) {
                bestTime = lap.lap_time_ms;
                bestTimeStr = lap.lap_time;
              }
            }
          }
        }
      }
      
      this.liveQualifyingState.set(result.abbreviation, {
        bestTime,
        bestTimeStr,
        eliminated: isEliminated,
        eliminatedIn: isQ1Eliminated ? 'Q1' : (isQ2Eliminated ? 'Q2' : null)
      });
    }
  }

  /**
   * Calculate Q1 eliminations - use official results from API
   */
  private calculateQ1Eliminations(): void {
    if (!this.qualifyingData) return;
    
    // Use official elimination data from API results
    this.q1EliminatedDrivers.clear();
    for (const result of this.qualifyingData.results) {
      if (result.eliminated_in === 'Q1') {
        this.q1EliminatedDrivers.add(result.abbreviation);
      }
    }
  }

  /**
   * Calculate Q2 eliminations - use official results from API
   */
  private calculateQ2Eliminations(): void {
    if (!this.qualifyingData) return;
    
    // Use official elimination data from API results
    this.q2EliminatedDrivers.clear();
    for (const result of this.qualifyingData.results) {
      if (result.eliminated_in === 'Q2') {
        this.q2EliminatedDrivers.add(result.abbreviation);
      }
    }
  }

  /**
   * Get the current live position and time for a driver
   */
  getLiveQualifyingPosition(driverCode: string): { position: number; time: string | null; eliminated: boolean } {
    if (!this.qualifyingData || this.liveQualifyingState.size === 0) {
      return { position: 99, time: null, eliminated: false };
    }
    
    // Sort drivers by best time
    const standings = Array.from(this.liveQualifyingState.entries())
      .map(([driver, state]) => ({ driver, ...state }))
      .sort((a, b) => {
        // Eliminated drivers go to the end
        if (a.eliminated && !b.eliminated) return 1;
        if (!a.eliminated && b.eliminated) return -1;
        // No time goes after those with times
        if (a.bestTime === null && b.bestTime !== null) return 1;
        if (a.bestTime !== null && b.bestTime === null) return -1;
        if (a.bestTime === null && b.bestTime === null) return 0;
        return a.bestTime! - b.bestTime!;
      });
    
    const idx = standings.findIndex(s => s.driver === driverCode);
    const state = this.liveQualifyingState.get(driverCode);
    
    return {
      position: idx >= 0 ? idx + 1 : 99,
      time: state?.bestTimeStr || null,
      eliminated: state?.eliminated || false
    };
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
    // Clear the entry elements map - they'll be recreated on next updateDOM
    this.entryElements.clear();
    
    // Clear the entries container
    const entriesContainer = this.container.querySelector('.leaderboard-entries');
    if (entriesContainer) {
      entriesContainer.innerHTML = '';
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
    // For qualifying, update live state based on frame time
    // frame.t is typically in seconds from session start
    if (this.sessionMode === 'qualifying' && this.qualifyingData && frame.t !== undefined) {
      const sessionTimeMs = frame.t * 1000; // Convert seconds to milliseconds
      this.updateQualifyingTime(sessionTimeMs);
    }
    
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

      // Get qualifying data if available
      const qualiResult = this.qualifyingResultsMap.get(code);
      
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
        // Add qualifying fields if available
        q1Time: qualiResult?.q1_time,
        q2Time: qualiResult?.q2_time,
        q3Time: qualiResult?.q3_time,
        eliminatedIn: qualiResult?.eliminated_in,
      });
    }

    // Sort entries based on session mode
    if (this.sessionMode === 'qualifying' && this.liveQualifyingState.size > 0) {
      // In qualifying, sort by best lap time (from live standings)
      entries.sort((a, b) => {
        const aState = this.liveQualifyingState.get(a.code);
        const bState = this.liveQualifyingState.get(b.code);
        
        // Eliminated drivers go to the bottom
        const aEliminated = aState?.eliminated || false;
        const bEliminated = bState?.eliminated || false;
        if (aEliminated && !bEliminated) return 1;
        if (!aEliminated && bEliminated) return -1;
        
        const aTime = aState?.bestTime ?? Infinity;
        const bTime = bState?.bestTime ?? Infinity;
        
        // No time = bottom of non-eliminated
        if (aTime === Infinity && bTime !== Infinity) return 1;
        if (aTime !== Infinity && bTime === Infinity) return -1;
        
        return aTime - bTime;
      });
    } else {
      // In race mode, sort by progress on track
      entries.sort((a, b) => b.progress_m - a.progress_m);
    }

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

    const entryHeight = 28; // Keep it compact like race mode
    leaderboardEl.style.height = `${this.entries.length * entryHeight}px`;

    // Get elimination zone for current phase
    const eliminationZone = this.getEliminationZone();

    this.entries.forEach((entry, index) => {
      let entryEl = this.entryElements.get(entry.code);
      const displayPosition = index + 1;

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
      
      // Qualifying-specific: check if in elimination zone (danger zone) and eliminated status
      const liveStateForClass = this.liveQualifyingState.get(entry.code);
      // Only mark as eliminated if explicitly set in live state (not just undefined)
      const isInDangerZone = this.sessionMode === 'qualifying' && eliminationZone.includes(displayPosition) && liveStateForClass?.eliminated !== true;
      const isEliminated = this.sessionMode === 'qualifying' && liveStateForClass?.eliminated === true;
      
      
      // In race mode, 'out' means DNF. In qualifying, we don't use 'out' (we use 'eliminated' instead)
      const showOut = this.sessionMode === 'race' && entry.isOut;
      entryEl.className = `leaderboard-entry ${showOut ? 'out' : ''} ${isSelected ? 'selected' : ''} ${isLeader ? 'leader' : ''} ${isInDangerZone ? 'danger-zone' : ''} ${isEliminated ? 'eliminated' : ''}`;
      
      entryEl.style.setProperty('--driver-rgb', `${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]}`);
      
      // Build the expected innerHTML - different for qualifying vs race
      let expectedHTML: string;
      
      if (this.sessionMode === 'qualifying') {
        // Get LIVE qualifying state for this driver (not final results)
        const liveState = this.liveQualifyingState.get(entry.code);
        const isEliminated = liveState?.eliminated || false;
        
        // Use live best time, not final results
        // Show full lap time format (e.g., "1:23.456")
        const bestTime = liveState?.bestTimeStr || '-';
        
        expectedHTML = `
          <div class="driver-left">
            <div class="position">${displayPosition}</div>
            <span class="team-color-line ${teamColorClass}"></span>
            ${teamLogoPath ? `<img src="${teamLogoPath}" alt="${entry.code} team" class="team-logo" />` : ''}
            <div class="driver-code">${entry.code}</div>
          </div>
          <div class="driver-right quali-times">
            ${isEliminated ? `<span class="eliminated-label">OUT</span>` : ''}
            <span class="quali-time best-time">${bestTime}</span>
            <img src="${tyreImagePath}" 
                 alt="${tyreName}"
                 class="tyre-indicator"
                 title="${tyreName}" />
          </div>
        `;
      } else {
        // Race mode - original layout
        expectedHTML = `
          <div class="driver-left">
            <div class="position">${displayPosition}</div>
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
      }
      
      // Only update innerHTML if it's the first time or structure changed
      if (!entryEl.dataset.initialized) {
        entryEl.innerHTML = expectedHTML;
        entryEl.dataset.initialized = 'true';
      }
      
      // Update dynamic elements separately to preserve transitions
      // Only update pit-related elements in race mode
      if (this.sessionMode === 'race') {
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
        }
      }
      
      // Update position number
      const positionEl = entryEl.querySelector('.position');
      if (positionEl) {
        positionEl.textContent = `${displayPosition}`;
      }
      
      // Update DRS and tyre indicators (race mode only)
      if (this.sessionMode === 'race') {
        const drsIndicator = entryEl.querySelector('.drs-indicator');
        if (drsIndicator) {
          if (isDrsActive) {
            drsIndicator.classList.add('active');
          } else {
            drsIndicator.classList.remove('active');
          }
        }
        
        const tyreIndicator = entryEl.querySelector('.tyre-indicator') as HTMLImageElement;
        if (tyreIndicator && tyreIndicator.src !== tyreImagePath) {
          tyreIndicator.src = tyreImagePath;
          tyreIndicator.alt = tyreName;
          tyreIndicator.title = tyreName;
        }
      }
      
      // Update qualifying times (qualifying mode only)
      if (this.sessionMode === 'qualifying') {
        const qualiTimeEl = entryEl.querySelector('.quali-time.best-time');
        
        if (qualiTimeEl) {
          // Use LIVE state for times - show full lap time format (e.g., "1:23.456")
          const liveState = this.liveQualifyingState.get(entry.code);
          const bestTime = liveState?.bestTimeStr || '-';
          qualiTimeEl.textContent = bestTime;
        }
        
        // Update tyre indicator in qualifying mode too
        const tyreIndicator = entryEl.querySelector('.tyre-indicator') as HTMLImageElement;
        if (tyreIndicator && tyreIndicator.src !== tyreImagePath) {
          tyreIndicator.src = tyreImagePath;
          tyreIndicator.alt = tyreName;
          tyreIndicator.title = tyreName;
        }
        
        // Update eliminated label visibility
        const liveState = this.liveQualifyingState.get(entry.code);
        const isEliminated = liveState?.eliminated || false;
        let eliminatedLabel = entryEl.querySelector('.eliminated-label');
        
        if (isEliminated && !eliminatedLabel) {
          // Add eliminated label if not present
          const rightDiv = entryEl.querySelector('.driver-right');
          if (rightDiv) {
            const label = document.createElement('span');
            label.className = 'eliminated-label';
            label.textContent = 'OUT';
            rightDiv.insertBefore(label, rightDiv.firstChild);
          }
        } else if (!isEliminated && eliminatedLabel) {
          // Remove eliminated label if present but driver not eliminated
          eliminatedLabel.remove();
        }
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
    if (this.sessionMode === 'qualifying') {
      // Display SQ1/SQ2/SQ3 for Sprint Qualifying, Q1/Q2/Q3 for regular
      const displayPhase = this.isSprintQualifying ? `S${this.currentPhase}` : this.currentPhase;
      this.container.innerHTML = `
        <div class="leaderboard qualifying-mode">
          <div class="leaderboard-header">
            <img src="/images/logos/F1.svg" alt="F1" class="f1-logo" />
          </div>
          <div class="quali-header">
            <span class="quali-phase q1">${displayPhase}</span>
            <span class="quali-timer">--:--</span>
          </div>
          <div class="race-flag-banner"></div>
          <div class="leaderboard-entries"></div>
        </div>
      `;
    } else {
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

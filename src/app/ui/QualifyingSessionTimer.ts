/**
 * QualifyingSessionTimer - Displays the current qualifying phase and countdown
 * Shows Q1/Q2/Q3 indicator with session countdown timer
 */

import type { QualifyingMetadata } from '../playback/websocketClient';

export class QualifyingSessionTimer {
  private container: HTMLElement;
  private currentPhase: 'Q1' | 'Q2' | 'Q3' = 'Q1';
  private timeRemaining: number = 0; // seconds
  private sessionStatus: 'active' | 'paused' | 'ended' = 'active';
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  /**
   * Set the current qualifying phase
   */
  setPhase(phase: 'Q1' | 'Q2' | 'Q3'): void {
    this.currentPhase = phase;
    
    // Set initial time based on phase
    const phaseDurations: Record<string, number> = {
      'Q1': 18 * 60,
      'Q2': 15 * 60,
      'Q3': 12 * 60,
    };
    this.timeRemaining = phaseDurations[phase] || 18 * 60;
    
    this.updateDOM();
  }

  /**
   * Set the time remaining in seconds
   */
  setTimeRemaining(seconds: number): void {
    this.timeRemaining = Math.max(0, seconds);
    this.updateDOM();
  }

  /**
   * Set session status
   */
  setStatus(status: 'active' | 'paused' | 'ended'): void {
    this.sessionStatus = status;
    this.updateDOM();
  }

  /**
   * Set sector bests for display
   */
  setSectorBests(_bests: QualifyingMetadata['sector_bests']): void {
    // Reserved for future use
    this.updateDOM();
  }

  /**
   * Start countdown timer (for demo/replay purposes)
   */
  startCountdown(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    this.sessionStatus = 'active';
    this.timerInterval = setInterval(() => {
      if (this.sessionStatus === 'active' && this.timeRemaining > 0) {
        this.timeRemaining--;
        this.updateDOM();
        
        if (this.timeRemaining === 0) {
          this.sessionStatus = 'ended';
          this.updateDOM();
        }
      }
    }, 1000);
  }

  /**
   * Pause countdown
   */
  pauseCountdown(): void {
    this.sessionStatus = 'paused';
    this.updateDOM();
  }

  /**
   * Stop and clear countdown
   */
  stopCountdown(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private getTimerClass(): string {
    if (this.timeRemaining <= 60) return 'critical';
    if (this.timeRemaining <= 120) return 'warning';
    return '';
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="quali-timer-widget">
        <span class="timer-phase ${this.currentPhase.toLowerCase()}">${this.currentPhase}</span>
        <span class="timer-countdown">${this.formatTime(this.timeRemaining)}</span>
        <span class="timer-status ${this.sessionStatus}">${this.sessionStatus.toUpperCase()}</span>
      </div>
    `;
  }

  private updateDOM(): void {
    const phaseEl = this.container.querySelector('.timer-phase');
    const countdownEl = this.container.querySelector('.timer-countdown');
    const statusEl = this.container.querySelector('.timer-status');

    if (phaseEl) {
      phaseEl.textContent = this.currentPhase;
      phaseEl.className = `timer-phase ${this.currentPhase.toLowerCase()}`;
    }

    if (countdownEl) {
      countdownEl.textContent = this.formatTime(this.timeRemaining);
      countdownEl.className = `timer-countdown ${this.getTimerClass()}`;
    }

    if (statusEl) {
      statusEl.textContent = this.sessionStatus.toUpperCase();
      statusEl.className = `timer-status ${this.sessionStatus}`;
    }
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
    this.stopCountdown();
  }

  destroy(): void {
    this.stopCountdown();
    this.container.innerHTML = '';
  }
}

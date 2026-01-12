import { PlaybackController } from './playbackController';
import type { PlaybackState } from './playbackController';
import { WebSocketClient } from './websocketClient';

export class PlaybackUI {
  private container: HTMLElement;
  private controller: PlaybackController;
  private wsClient: WebSocketClient;

  private playPauseBtn?: HTMLButtonElement;
  private stopBtn?: HTMLButtonElement;
  private speedDisplay?: HTMLSpanElement;
  private progressBar?: HTMLInputElement;
  private timeDisplay?: HTMLSpanElement;

  constructor(container: HTMLElement, controller: PlaybackController, wsClient: WebSocketClient) {
    this.container = container;
    this.controller = controller;
    this.wsClient = wsClient;

    this.render();
    this.attachEventListeners();

    // Listen to controller state changes
    this.controller.onStateChange((state) => this.updateUI(state));
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="playback-controls">
        <div class="controls-left">
          <button id="play-pause-btn" class="control-btn" title="Play/Pause (Space)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path id="play-icon" d="M8 5v14l11-7z"/>
              <path id="pause-icon" d="M6 4h4v16H6zM14 4h4v16h-4z" style="display:none"/>
            </svg>
          </button>
          
          <button id="stop-btn" class="control-btn" title="Stop (R)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12"/>
            </svg>
          </button>

          <button id="rewind-btn" class="control-btn" title="Rewind (←)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.5 12l8.5 6V6zM4 18l8.5-6L4 6z"/>
            </svg>
          </button>

          <button id="forward-btn" class="control-btn" title="Forward (→)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 18l8.5-6L4 6zM12.5 6v12l8.5-6z"/>
            </svg>
          </button>
        </div>

        <div class="controls-center">
          <input 
            type="range" 
            id="progress-bar" 
            class="progress-slider" 
            min="0" 
            max="100" 
            value="0"
            title="Seek"
          />
          <div class="time-display">
            <span id="time-display">00:00 / 00:00</span>
          </div>
        </div>

        <div class="controls-right">
          <button id="speed-down-btn" class="control-btn" title="Slower (↓)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <text x="50%" y="70%" text-anchor="middle" font-size="16" font-weight="bold">-</text>
            </svg>
          </button>
          
          <span id="speed-display" class="speed-display">1.0x</span>
          
          <button id="speed-up-btn" class="control-btn" title="Faster (↑)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <text x="50%" y="70%" text-anchor="middle" font-size="16" font-weight="bold">+</text>
            </svg>
          </button>
        </div>
      </div>

      <div class="keyboard-hints">
        <span>Space: Play/Pause</span>
        <span>← →: Seek</span>
        <span>↑ ↓: Speed</span>
        <span>R: Restart</span>
        <span>1-4: Speed presets</span>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Get elements
    this.playPauseBtn = this.container.querySelector('#play-pause-btn') as HTMLButtonElement;
    this.stopBtn = this.container.querySelector('#stop-btn') as HTMLButtonElement;
    this.speedDisplay = this.container.querySelector('#speed-display') as HTMLSpanElement;
    this.progressBar = this.container.querySelector('#progress-bar') as HTMLInputElement;
    this.timeDisplay = this.container.querySelector('#time-display') as HTMLSpanElement;

    // Play/Pause
    this.playPauseBtn?.addEventListener('click', () => {
      const state = this.controller.getState();
      if (state.isPlaying) {
        this.controller.pause();
        this.wsClient.pause();
      } else {
        this.controller.play();
        this.wsClient.play();
      }
    });

    // Stop
    this.stopBtn?.addEventListener('click', () => {
      this.controller.stop();
      this.wsClient.stop();
    });

    // Rewind
    this.container.querySelector('#rewind-btn')?.addEventListener('click', () => {
      this.controller.seekRelative(-250); // ~10 seconds at 25 FPS
      this.wsClient.seek(this.controller.getState().currentFrame);
    });

    // Forward
    this.container.querySelector('#forward-btn')?.addEventListener('click', () => {
      this.controller.seekRelative(250); // ~10 seconds at 25 FPS
      this.wsClient.seek(this.controller.getState().currentFrame);
    });

    // Speed controls
    this.container.querySelector('#speed-down-btn')?.addEventListener('click', () => {
      this.controller.decreaseSpeed();
      this.wsClient.setSpeed(this.controller.getState().speed);
    });

    this.container.querySelector('#speed-up-btn')?.addEventListener('click', () => {
      this.controller.increaseSpeed();
      this.wsClient.setSpeed(this.controller.getState().speed);
    });

    // Progress bar
    this.progressBar?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      const state = this.controller.getState();
      const frameNumber = Math.floor((value / 100) * state.totalFrames);
      this.controller.seekToFrame(frameNumber);
      this.wsClient.seek(frameNumber);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyPress(e));
  }

  private handleKeyPress(e: KeyboardEvent): void {
    // Ignore if typing in input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const state = this.controller.getState();

    switch (e.key) {
      case ' ': // Spacebar
        e.preventDefault();
        if (state.isPlaying) {
          this.controller.pause();
          this.wsClient.pause();
        } else {
          this.controller.play();
          this.wsClient.play();
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        this.controller.seekRelative(-250);
        this.wsClient.seek(this.controller.getState().currentFrame);
        break;

      case 'ArrowRight':
        e.preventDefault();
        this.controller.seekRelative(250);
        this.wsClient.seek(this.controller.getState().currentFrame);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.controller.increaseSpeed();
        this.wsClient.setSpeed(this.controller.getState().speed);
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.controller.decreaseSpeed();
        this.wsClient.setSpeed(this.controller.getState().speed);
        break;

      case 'r':
      case 'R':
        e.preventDefault();
        this.controller.stop();
        this.wsClient.stop();
        break;

      case '1':
        this.controller.setSpeed(0.5);
        this.wsClient.setSpeed(0.5);
        break;

      case '2':
        this.controller.setSpeed(1.0);
        this.wsClient.setSpeed(1.0);
        break;

      case '3':
        this.controller.setSpeed(2.0);
        this.wsClient.setSpeed(2.0);
        break;

      case '4':
        this.controller.setSpeed(4.0);
        this.wsClient.setSpeed(4.0);
        break;
    }
  }

  private updateUI(state: PlaybackState): void {
    // Update play/pause icon
    const playIcon = this.container.querySelector('#play-icon') as SVGPathElement;
    const pauseIcon = this.container.querySelector('#pause-icon') as SVGPathElement;
    if (playIcon && pauseIcon) {
      playIcon.style.display = state.isPlaying ? 'none' : 'block';
      pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
    }

    // Update speed display
    if (this.speedDisplay) {
      this.speedDisplay.textContent = `${state.speed.toFixed(1)}x`;
    }

    // Update progress bar
    if (this.progressBar) {
      const progress = (state.currentFrame / state.totalFrames) * 100;
      this.progressBar.value = progress.toString();
    }

    // Update time display
    if (this.timeDisplay) {
      const currentTime = Math.floor(state.currentFrame / 25); // 25 FPS
      const totalTime = Math.floor(state.totalFrames / 25);
      this.timeDisplay.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(totalTime)}`;
    }
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  destroy(): void {
    document.removeEventListener('keydown', (e) => this.handleKeyPress(e));
  }
}

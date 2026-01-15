export interface TelemetryFrame {
  t: number;
  lap: number;
  frameNumber?: number;
  weather?: {
    track_temp: number | null;
    air_temp: number | null;
    humidity: number | null;
    wind_speed: number | null;
    wind_direction: number | null;
    rain_state: 'DRY' | 'RAINING';
  };
  drivers: {
    [code: string]: {
      x: number;
      y: number;
      lap: number;
      dist: number;
      rel_dist: number;
      speed: number;
      gear: number;
      drs: number;
      throttle: number;
      brake: number;
      position: number;
      tyre: number;
    };
  };
}

export interface TelemetryMetadata {
  totalFrames: number;
  driverColors: { [code: string]: [number, number, number] };
  totalLaps: number;
  driverTeams?: { [code: string]: { name: string; key: string } };
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  private onFrameCallback?: (frame: TelemetryFrame) => void;
  private onMetadataCallback?: (metadata: TelemetryMetadata) => void;
  private onConnectedCallback?: () => void;
  private onDisconnectedCallback?: () => void;
  private onModeChangeCallback?: (mode: string, config: any) => void;
  private onModesReceivedCallback?: (modes: any, current: string) => void;

  constructor(url: string = 'ws://localhost:3001') {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.reconnectAttempts = 0;
          this.onConnectedCallback?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.onDisconnectedCallback?.();
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'metadata':
        console.log('📊 Received metadata:', message.data);
        this.onMetadataCallback?.(message.data);
        break;

      case 'frame':
        // Pass both frame data and frameNumber
        const frameData = { ...message.data, frameNumber: message.frameNumber };
        this.onFrameCallback?.(frameData);
        break;

      case 'status':
        console.log('Status:', message.message);
        break;

      case 'modeChanged':
        console.log(`🔄 Streaming mode changed to: ${message.config?.name}`);
        this.onModeChangeCallback?.(message.mode, message.config);
        break;

      case 'modes':
        console.log('📋 Available modes:', message.modes);
        this.onModesReceivedCallback?.(message.modes, message.current);
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  sendCommand(command: string, value?: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ command, value }));
    } else {
      console.warn('WebSocket not connected, cannot send command:', command);
    }
  }

  play(): void {
    this.sendCommand('start');
  }

  pause(): void {
    this.sendCommand('pause');
  }

  stop(): void {
    this.sendCommand('stop');
  }

  seek(frameNumber: number): void {
    this.sendCommand('seek', frameNumber);
  }

  setSpeed(speed: number): void {
    this.sendCommand('speed', speed);
  }

  // Streaming mode controls (for research simulation)
  setMode(mode: string): void {
    this.sendCommand('mode', mode);
  }

  getModes(): void {
    this.sendCommand('getModes');
  }

  onFrame(callback: (frame: TelemetryFrame) => void): void {
    this.onFrameCallback = callback;
  }

  onMetadata(callback: (metadata: TelemetryMetadata) => void): void {
    this.onMetadataCallback = callback;
  }

  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  onModeChange(callback: (mode: string, config: any) => void): void {
    this.onModeChangeCallback = callback;
  }

  onModesReceived(callback: (modes: any, current: string) => void): void {
    this.onModesReceivedCallback = callback;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnect attempts reached. Please refresh the page.');
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export interface TelemetryFrame {
  t: number;
  lap: number;
  frameNumber?: number;
  track_status?: string;  // "1"=Clear, "2"=Yellow, "4"=SC, "5"=Red, "6"/"7"=VSC
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
      rpm: number;
      position: number;
      tyre: number;
    };
  };
}

export interface RaceEvent {
  type: 'dnf' | 'yellow_flag' | 'safety_car' | 'red_flag' | 'vsc';
  frame: number;
  endFrame?: number;
  label: string;
  lap: number | string;
}

export interface TelemetryMetadata {
  totalFrames: number;
  driverColors: { [code: string]: [number, number, number] };
  totalLaps: number;
  driverTeams?: { [code: string]: { name: string; key: string } };
  events?: RaceEvent[];
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  private onFrameCallbacks: Array<(frame: TelemetryFrame) => void> = [];
  private onMetadataCallbacks: Array<(metadata: TelemetryMetadata) => void> = [];
  private onConnectedCallbacks: Array<() => void> = [];
  private onDisconnectedCallbacks: Array<() => void> = [];
  private onModeChangeCallbacks: Array<(mode: string, config: any) => void> = [];
  private onModesReceivedCallbacks: Array<(modes: any, current: string) => void> = [];

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
          this.onConnectedCallbacks.forEach(cb => cb());
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
          this.onDisconnectedCallbacks.forEach(cb => cb());
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
        this.onMetadataCallbacks.forEach(cb => cb(message.data));
        break;

      case 'frame':
        // Pass both frame data and frameNumber
        const frameData = { ...message.data, frameNumber: message.frameNumber };
        this.onFrameCallbacks.forEach(cb => cb(frameData));
        break;

      case 'status':
        console.log('Status:', message.message);
        break;

      case 'modeChanged':
        console.log(`🔄 Streaming mode changed to: ${message.config?.name}`);
        this.onModeChangeCallbacks.forEach(cb => cb(message.mode, message.config));
        break;

      case 'modes':
        console.log('📋 Available modes:', message.modes);
        this.onModesReceivedCallbacks.forEach(cb => cb(message.modes, message.current));
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

  setStreamingMode(mode: 'replay' | 'live' | 'polling'): void {
    console.log(`📡 Setting streaming mode to: ${mode}`);
    this.sendCommand('mode', mode);
  }

  getModes(): void {
    this.sendCommand('getModes');
  }

  /**
   * Reconnect to the WebSocket server - triggers fresh metadata and first frame
   * Call this after loading a new race to refresh the data
   */
  async reconnect(): Promise<void> {
    // Close existing connection if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    // Small delay to ensure clean close
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Reconnect
    return this.connect();
  }

  onFrame(callback: (frame: TelemetryFrame) => void): void {
    this.onFrameCallbacks.push(callback);
  }

  onMetadata(callback: (metadata: TelemetryMetadata) => void): void {
    this.onMetadataCallbacks.push(callback);
  }

  onConnected(callback: () => void): void {
    this.onConnectedCallbacks.push(callback);
  }

  onDisconnected(callback: () => void): void {
    this.onDisconnectedCallbacks.push(callback);
  }

  onModeChange(callback: (mode: string, config: any) => void): void {
    this.onModeChangeCallbacks.push(callback);
  }

  onModesReceived(callback: (modes: any, current: string) => void): void {
    this.onModesReceivedCallbacks.push(callback);
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

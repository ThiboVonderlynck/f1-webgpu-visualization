// ...existing code...
export type CircuitFormat = 'stl' | '3mf';

export interface CircuitFile {
  filename: string;
  format: CircuitFormat;
  displayName: string;
  rotation?: number;
}

// ...existing code...
export interface CarConfig {
  name: string;
  color: number;
  speed?: number;
  startPosition?: number;
}

// ...existing code...
export type UpdateCallback = (deltaTime: number) => void;

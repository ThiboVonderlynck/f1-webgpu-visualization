// Circuit types - REMOVED (now using telemetry-based tracks)
// Previously: CircuitFile, CircuitFormat for STL/3MF loading

// Car types
export interface CarConfig {
  name: string;
  color: number;
  speed?: number;
  startPosition?: number;
}

// Animation types
export type UpdateCallback = (deltaTime: number) => void;

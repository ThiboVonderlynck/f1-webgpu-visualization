import * as THREE from 'three';
import { loadCircuitGeometry, processCircuitGeometry, createCircuitMesh } from './circuitLoader.js';
import { positionCameraForCircuit } from '../core/camera.js';
import type { CircuitFile } from './circuitLoader.js';

export class CircuitManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: any; // OrbitControls
  private currentCircuit: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: any) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
  }

  async loadCircuit(circuitFile: CircuitFile): Promise<void> {
    try {
      if (this.currentCircuit) {
        this.removeCircuit();
      }

      const geometry = await loadCircuitGeometry(circuitFile.filename, circuitFile.format);
      const { maxDimension } = processCircuitGeometry(geometry);
      const circuit = createCircuitMesh(geometry, circuitFile.rotation);

      this.scene.add(circuit);
      this.currentCircuit = circuit;
      positionCameraForCircuit(this.camera, this.controls, maxDimension);
    } catch (error) {
      console.error('Error loading circuit:', error);
      throw error;
    }
  }

  private removeCircuit(): void {
    if (this.currentCircuit) {
      this.scene.remove(this.currentCircuit);
      this.currentCircuit.geometry.dispose();
      if (this.currentCircuit.material instanceof THREE.Material) {
        this.currentCircuit.material.dispose();
      }
      this.currentCircuit = null;
    }
  }

  getCurrentCircuit(): THREE.Mesh | null {
    return this.currentCircuit;
  }
}

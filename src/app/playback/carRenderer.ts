import * as THREE from 'three';
import type { TelemetryFrame, TelemetryMetadata } from './websocketClient';

export class CarRenderer {
  private scene: THREE.Scene;
  private cars: Map<string, THREE.Mesh> = new Map();
  private driverColors: Map<string, THREE.Color> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  initializeCars(metadata: TelemetryMetadata): void {
    console.log('🏎️ Initializing cars:', Object.keys(metadata.driverColors).length, 'drivers');

    this.clearCars();

    Object.entries(metadata.driverColors).forEach(([code, rgb]) => {
      const color = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      this.driverColors.set(code, color);

      const geometry = new THREE.SphereGeometry(50, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 1.0,
        metalness: 0.9,
        roughness: 0.05,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `car-${code}`;
      mesh.position.y = 10;
      mesh.castShadow = true;

      this.cars.set(code, mesh);
      this.scene.add(mesh);
    });

    console.log('✅ Cars initialized');
  }

  updatePositions(frame: TelemetryFrame): void {
    Object.entries(frame.drivers).forEach(([code, driver]) => {
      const car = this.cars.get(code);
      if (car) {
        // Telemetry Y maps to Three.js Z coordinate
        car.position.set(driver.x, 10, driver.y);
      }
    });
  }

  clearCars(): void {
    this.cars.forEach((car) => {
      this.scene.remove(car);
      car.geometry.dispose();
      (car.material as THREE.Material).dispose();
    });
    this.cars.clear();
    this.driverColors.clear();
  }

  getCar(code: string): THREE.Mesh | undefined {
    return this.cars.get(code);
  }

  getAllCars(): Map<string, THREE.Mesh> {
    return this.cars;
  }

  dispose(): void {
    this.clearCars();
  }
}

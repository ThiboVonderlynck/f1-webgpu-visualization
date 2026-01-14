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
      // Convert RGB (0-255) to hex color like DRS zones for consistent brightness
      const hexColor = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      const color = new THREE.Color(hexColor);
      this.driverColors.set(code, color);

      const geometry = new THREE.SphereGeometry(50, 32, 32);
      const material = new THREE.MeshBasicMaterial({
        color: hexColor, // Use hex directly like DRS
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `car-${code}`;
      mesh.position.y = 10;
      mesh.castShadow = false; // BasicMaterial doesn't cast shadows

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

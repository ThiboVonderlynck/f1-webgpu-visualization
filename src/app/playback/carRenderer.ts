import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { TelemetryFrame, TelemetryMetadata } from './websocketClient';

// Team to model path mapping (team keys from metadata.driverTeams)
const TEAM_MODEL_PATHS: { [teamKey: string]: string } = {
  redbull: '/files/Redbull.glb',
  mercedes: '/files/Mercedes.glb',
  ferrari: '/files/Ferrari.glb',
  mclaren: '/files/Mclaren.glb',
  astonmartin: '/files/AstonMartin.glb',
  alpine: '/files/Alpine.glb',
  williams: '/files/Williams.glb',
  racingbulls: '/files/RacingBulls.glb',
  kicksauber: '/files/KickSauber.glb',
  haas: '/files/Haas.glb',
};

export class CarRenderer {
  private scene: THREE.Scene;
  private cars: Map<string, THREE.Object3D> = new Map();
  private driverColors: Map<string, THREE.Color> = new Map();
  private driverTeams: Map<string, string> = new Map();
  private loadedModels: Map<string, THREE.Object3D> = new Map();
  private cameraMounts: Map<string, THREE.Object3D> = new Map(); // POV camera mount points per driver
  private gltfLoader: GLTFLoader;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Set up DRACO loader for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(dracoLoader);
  }

  async initializeCars(metadata: TelemetryMetadata): Promise<void> {
    this.clearCars();

    // Store driver team mappings
    if (metadata.driverTeams) {
      Object.entries(metadata.driverTeams).forEach(([code, teamInfo]) => {
        this.driverTeams.set(code, teamInfo.key);
      });
    }

    // Pre-load all required models
    const teamsToLoad = new Set<string>();
    this.driverTeams.forEach((teamKey) => {
      if (TEAM_MODEL_PATHS[teamKey]) {
        teamsToLoad.add(teamKey);
      }
    });

    for (const teamKey of teamsToLoad) {
      try {
        const model = await this.loadModel(TEAM_MODEL_PATHS[teamKey]);
        this.loadedModels.set(teamKey, model);
      } catch (error) {
        console.error(`Failed to load model for ${teamKey}:`, error);
      }
    }

    // Create cars for each driver
    Object.entries(metadata.driverColors).forEach(([code, rgb]) => {
      const hexColor = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      const color = new THREE.Color(hexColor);
      this.driverColors.set(code, color);

      // Get the correct team model for this driver
      const teamKey = this.driverTeams.get(code);
      const model = teamKey ? this.loadedModels.get(teamKey) : null;

      let carObject: THREE.Object3D;

      if (model) {
        // Clone the loaded model for this driver
        carObject = model.clone();
        
        // Scale: Real F1 car is 2m wide, model is 2.10 units
        // Target: 2m * 20 (circuit scale) = 40 units
        // Scale factor: 40 / 2.10 ≈ 19
        const scaleFactor = 19;
        carObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
        
        // Calculate Y offset to place car on track surface (Y = 2.0)
        // Get bounding box of scaled model to find the bottom
        const box = new THREE.Box3().setFromObject(carObject);
        const bottomY = box.min.y;
        const trackSurfaceY = 2.0; // From trackRenderer.ts trackThickness
        carObject.position.y = trackSurfaceY - bottomY;
        
        // Rotate model to face forward
        carObject.rotation.y = Math.PI / 2;
        
        // Extract camera_mount for POV camera (if present in model)
        carObject.traverse((child) => {
          if (child.name === 'camera_mount') {
            this.cameraMounts.set(code, child);
          }
        });
      } else {
        // Fall back to sphere for teams without models
        const geometry = new THREE.SphereGeometry(50, 32, 32);
        const material = new THREE.MeshBasicMaterial({
          color: hexColor,
        });
        carObject = new THREE.Mesh(geometry, material);
        carObject.position.y = 10;
      }

      carObject.name = `car-${code}`;
      this.cars.set(code, carObject);
      this.scene.add(carObject);
    });
  }

  private loadModel(path: string): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          
          // Convert PBR materials to BasicMaterial to render correctly without environment maps
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              // Convert materials to MeshBasicMaterial for reliable WebGPU rendering
              if (child.material) {
                const convertMaterial = (mat: THREE.Material): THREE.MeshBasicMaterial => {
                  if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                    const basicMat = new THREE.MeshBasicMaterial();
                    
                    // Copy the diffuse/albedo map (the main texture)
                    if (mat.map) {
                      basicMat.map = mat.map;
                    }
                    
                    // Use the base color if no texture
                    basicMat.color = mat.color.clone();
                    
                    // Copy transparency settings
                    basicMat.transparent = mat.transparent;
                    basicMat.opacity = mat.opacity;
                    basicMat.alphaMap = mat.alphaMap;
                    basicMat.side = mat.side;
                    
                    mat.dispose();
                    return basicMat;
                  }
                  return mat as THREE.MeshBasicMaterial;
                };
                
                if (Array.isArray(child.material)) {
                  child.material = child.material.map(convertMaterial);
                } else {
                  child.material = convertMaterial(child.material);
                }
              }
            }
          });
          
          resolve(model);
        },
        () => {},
        (error) => {
          reject(error);
        }
      );
    });
  }

  updatePositions(frame: TelemetryFrame): void {
    Object.entries(frame.drivers).forEach(([code, driver]) => {
      const car = this.cars.get(code);
      if (car) {
        // Store previous position for rotation calculation
        const prevX = car.position.x;
        const prevZ = car.position.z;
        
        // Telemetry Y maps to Three.js Z coordinate
        car.position.set(driver.x, car.position.y, driver.y);
        
        // Calculate heading based on movement direction (for 3D models)
        const dx = driver.x - prevX;
        const dz = driver.y - prevZ;
        
        // Only update rotation if there's significant movement
        if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) {
          const targetRotation = Math.atan2(dx, dz);
          
          // Smooth rotation
          const currentRotation = car.rotation.y;
          const rotationDiff = targetRotation - currentRotation;
          
          // Normalize rotation difference to [-PI, PI]
          let normalizedDiff = rotationDiff;
          while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
          while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;
          
          // Apply smoothed rotation
          car.rotation.y += normalizedDiff * 0.3;
        }
      }
    });
  }

  clearCars(): void {
    this.cars.forEach((car) => {
      this.scene.remove(car);
      
      // Dispose of geometries and materials
      car.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    });
    this.cars.clear();
    this.driverColors.clear();
    this.loadedModels.clear();
  }

  getCar(code: string): THREE.Object3D | undefined {
    return this.cars.get(code);
  }

  getCameraMount(code: string): THREE.Object3D | undefined {
    return this.cameraMounts.get(code);
  }

  getAllCars(): Map<string, THREE.Object3D> {
    return this.cars;
  }

  /**
   * Set visibility for a specific car (used to hide eliminated drivers in qualifying)
   */
  setCarVisible(code: string, visible: boolean): void {
    const car = this.cars.get(code);
    if (car) {
      car.visible = visible;
    }
  }

  /**
   * Set visibility for multiple cars at once
   */
  setEliminatedDrivers(eliminatedCodes: Set<string>): void {
    this.cars.forEach((car, code) => {
      car.visible = !eliminatedCodes.has(code);
    });
  }

  /**
   * Show all cars (reset visibility)
   */
  showAllCars(): void {
    this.cars.forEach((car) => {
      car.visible = true;
    });
  }

  dispose(): void {
    this.clearCars();
  }
}

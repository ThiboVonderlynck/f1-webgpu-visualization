import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { TelemetryFrame, TelemetryMetadata } from './websocketClient';
import { type CarRenderMode } from '../ui/RenderSettings';

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
  private carRenderMode: CarRenderMode = 'detailed';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    // Set up DRACO loader for compressed models
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(dracoLoader);
  }

  setCarRenderMode(mode: CarRenderMode): void {
    this.carRenderMode = mode;
  }

  async initializeCars(metadata: TelemetryMetadata): Promise<void> {
    this.clearCars();

    // Store driver team mappings
    if (metadata.driverTeams) {
      Object.entries(metadata.driverTeams).forEach(([code, teamInfo]) => {
        this.driverTeams.set(code, teamInfo.key);
      });
    }

    // Pre-load models based on render mode
    if (this.carRenderMode === 'detailed') {
      // Load all team-specific models
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
    } else {
      // Low poly mode - load single base model (Haas - smallest file)
      await this.loadLowPolyBaseModel();
    }

    // Create cars for each driver
    for (const [code, rgb] of Object.entries(metadata.driverColors)) {
      const hexColor = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      const color = new THREE.Color(hexColor);
      this.driverColors.set(code, color);

      let carObject: THREE.Object3D;

      if (this.carRenderMode === 'detailed') {
        // Get the correct team model for this driver
        const teamKey = this.driverTeams.get(code);
        const model = teamKey ? this.loadedModels.get(teamKey) : null;

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
          // Fall back to low poly if model not available
          if (this.lowPolyBaseModel) {
            carObject = this.createLowPolyCarFromModel(this.lowPolyBaseModel, hexColor);
          } else {
            carObject = this.createFallbackLowPolyCar(hexColor);
          }
        }
      } else {
        // Low poly mode - use base model with team color
        if (this.lowPolyBaseModel) {
          carObject = this.createLowPolyCarFromModel(this.lowPolyBaseModel, hexColor);
        } else {
          carObject = this.createFallbackLowPolyCar(hexColor);
        }
      }

      carObject.name = `car-${code}`;
      this.cars.set(code, carObject);
      this.scene.add(carObject);
    }
  }

  private lowPolyBaseModel: THREE.Object3D | null = null;

  private async loadLowPolyBaseModel(): Promise<THREE.Object3D | null> {
    if (this.lowPolyBaseModel) {
      return this.lowPolyBaseModel;
    }
    
    try {
      // Use Haas model as base (smallest at 2.5MB)
      const model = await this.loadModel('/files/Haas.glb');
      this.lowPolyBaseModel = model;
      return model;
    } catch (error) {
      console.error('Failed to load low-poly base model:', error);
      return null;
    }
  }

  private createLowPolyCarFromModel(baseModel: THREE.Object3D, color: number): THREE.Object3D {
    const carObject = baseModel.clone();
    
    // Apply solid team color to all mesh materials
    const teamColor = new THREE.Color(color);
    carObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Clone material to avoid affecting other cars
        if (Array.isArray(child.material)) {
          child.material = child.material.map(() => 
            new THREE.MeshBasicMaterial({ color: teamColor })
          );
        } else {
          child.material = new THREE.MeshBasicMaterial({ color: teamColor });
        }
      }
    });
    
    // Scale: Real F1 car is 2m wide, model is 2.10 units
    const scaleFactor = 19;
    carObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Position on track surface
    const box = new THREE.Box3().setFromObject(carObject);
    const bottomY = box.min.y;
    const trackSurfaceY = 2.0;
    carObject.position.y = trackSurfaceY - bottomY;
    
    // Rotate model to face forward
    carObject.rotation.y = Math.PI / 2;
    
    return carObject;
  }

  private createFallbackLowPolyCar(color: number): THREE.Object3D {
    // Fallback to simple box shape if model fails to load
    const group = new THREE.Group();
    
    const bodyGeometry = new THREE.BoxGeometry(100, 20, 40);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 15;
    group.add(body);
    
    const cockpitGeometry = new THREE.BoxGeometry(30, 15, 25);
    const cockpitMaterial = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(10, 30, 0);
    group.add(cockpit);
    
    group.position.y = 2.0;
    
    return group;
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

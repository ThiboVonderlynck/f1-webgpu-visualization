import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCamera(): THREE.PerspectiveCamera {
  // Create camera with wide far plane to accommodate large tracks (F1 tracks can span 7km+)
  const camera = new THREE.PerspectiveCamera(
    60, // FOV
    window.innerWidth / window.innerHeight, // Aspect ratio
    0.1, // Near plane
    50000 // Far plane (50km to be safe)
  );
  return camera;
}

export function createControls(camera: THREE.PerspectiveCamera, domElement: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  return controls;
}

export function positionCameraForCircuit(camera: THREE.PerspectiveCamera, controls: OrbitControls, maxDimension: number): void {
  const cameraDistance = maxDimension * 2;
  camera.position.set(0, cameraDistance, 0);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
}

export function setupCameraResize(camera: THREE.PerspectiveCamera): void {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

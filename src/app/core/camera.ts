import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
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

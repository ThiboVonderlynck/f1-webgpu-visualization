import WebGPU from 'three/addons/capabilities/WebGPU.js';
import * as THREE from 'three';
import { createRenderer } from './app/renderer.js';

if (!WebGPU.isAvailable()) {
  const errorMessage = WebGPU.getErrorMessage();
  document.body.appendChild(errorMessage);
  throw new Error('WebGPU not supported');
}

// Initialize WebGPU renderer and scene
async function init() {
  // Initialize WebGPU renderer
  const renderer = createRenderer();

  // Initialize the WebGPU backend (required before rendering)
  await renderer.init();

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  // Create camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;

  // Add a simple cube to test
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  // Add lights (required for MeshStandardMaterial)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    // Rotate cube
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // Render with WebGPU
    renderer.render(scene, camera);
  }

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Start animation
  animate();
}

// Start initialization
init().catch((error) => {
  console.error('Failed to initialize WebGPU:', error);
  document.body.innerHTML = `
    <p>Failed to initialize WebGPU: ${error.message}</p>
  `;
});

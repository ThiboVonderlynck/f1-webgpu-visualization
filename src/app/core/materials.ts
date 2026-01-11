import * as THREE from 'three';

/**
 * Material utilities for 3D rendering
 */

export function createCurbstoneMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
}

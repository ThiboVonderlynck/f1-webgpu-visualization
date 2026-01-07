import * as THREE from 'three';

export function createCurbstoneMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
}
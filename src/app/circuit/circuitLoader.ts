import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createCurbstoneMaterial } from '../core/materials.js';
import type { CircuitFormat, CircuitFile } from '../../types';

export type { CircuitFormat, CircuitFile };

async function loadSTLGeometry(filename: string): Promise<THREE.BufferGeometry> {
  const loader = new STLLoader();
  const geometry = await loader.loadAsync(`/data/circuits/${filename}`);
  return geometry;
}

async function load3MFGeometry(filename: string): Promise<THREE.BufferGeometry> {
  const loader = new ThreeMFLoader();
  const object = await loader.loadAsync(`/data/circuits/${filename}`);
  const geometries: THREE.BufferGeometry[] = [];

  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      geometries.push(child.geometry);
    }
  });

  if (geometries.length === 0) {
    throw new Error('No geometry found in 3MF file');
  }

  if (geometries.length === 1) {
    return geometries[0];
  }

  const mergedGeometries = BufferGeometryUtils.mergeGeometries(geometries);
  return mergedGeometries || geometries[0];
}

export async function loadCircuitGeometry(filename: string, format: CircuitFormat): Promise<THREE.BufferGeometry> {
  switch (format) {
    case 'stl':
      return loadSTLGeometry(filename);
    case '3mf':
      return load3MFGeometry(filename);
    default:
      throw new Error(`Unsupported circuit format: ${format}`);
  }
}

export function processCircuitGeometry(geometry: THREE.BufferGeometry): {
  size: THREE.Vector3;
  maxDimension: number;
} {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;

  if (!box) {
    throw new Error('Failed to compute bounding box for circuit geometry');
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z);

  const TARGET_SIZE = 200;
  if (maxDimension > TARGET_SIZE) {
    const scaleFactor = TARGET_SIZE / maxDimension;
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);
    size.multiplyScalar(scaleFactor);
    return { size, maxDimension: maxDimension * scaleFactor };
  }

  return { size, maxDimension };
}

export function createCircuitMesh(geometry: THREE.BufferGeometry, rotation?: number): THREE.Mesh {
  const material = createCurbstoneMaterial();
  const circuit = new THREE.Mesh(geometry, material);
  circuit.rotation.x = -Math.PI / 2;

  if (rotation !== undefined) {
    circuit.rotation.z = rotation;
  }

  circuit.position.set(0, 0, 0);
  return circuit;
}

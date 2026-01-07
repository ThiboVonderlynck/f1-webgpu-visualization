import * as THREE from 'three';

export class RacingLine {
  private curve: THREE.CatmullRomCurve3 | null = null;
  private points: THREE.Vector3[] = [];
  private circuitName: string = '';

  /**
   * Load centerline data from JSON file and apply same transformations as the circuit STL.
   * @param circuitName - Name of the circuit (e.g., 'bahrain', 'monaco')
   * @param rotation - Optional rotation to match circuit orientation
   */
  async load(circuitName: string, rotation?: number): Promise<void> {
    try {
      const response = await fetch(`/assets/circuits/generated/${circuitName}_centerline.json`);

      if (!response.ok) {
        throw new Error(`Failed to load centerline for ${circuitName}: ${response.statusText}`);
      }

      const data: number[][] = await response.json();

      // Convert to Vector3 array
      let points = data.map(([x, y, z]) => new THREE.Vector3(x, y, z));

      // Apply same transformations as STL circuit
      points = this.applyCircuitTransformations(points, rotation);

      this.points = points;

      // Create closed CatmullRom curve (true = closed loop)
      this.curve = new THREE.CatmullRomCurve3(this.points, true);
      this.circuitName = circuitName;

      console.log(`✓ Racing line loaded for ${circuitName}: ${this.points.length} points`);
    } catch (error) {
      console.error(`Error loading racing line for ${circuitName}:`, error);
      throw error;
    }
  }

  /**
   * Apply same transformations as circuit STL: center, scale, and rotate.
   * Matches the logic from circuitLoader.ts processCircuitGeometry and createCircuitMesh.
   */
  private applyCircuitTransformations(points: THREE.Vector3[], rotation?: number): THREE.Vector3[] {
    // Calculate bounding box
    const box = new THREE.Box3().setFromPoints(points);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z);

    // Calculate scale factor (same as STL)
    const TARGET_SIZE = 200;
    const scaleFactor = maxDimension > TARGET_SIZE ? TARGET_SIZE / maxDimension : 1;

    // Apply transformations
    let transformedPoints = points.map((point) => {
      // 1. Center (translate to origin)
      const centered = point.clone().sub(center);

      // 2. Scale
      const scaled = centered.multiplyScalar(scaleFactor);

      return scaled;
    });

    // 3. Rotate to match circuit mesh orientation
    // Circuit mesh gets: rotation.x = -Math.PI / 2 (flip to horizontal)
    // Then optional custom rotation.z
    const rotationMatrix = new THREE.Matrix4();

    // First rotation: flip from vertical to horizontal (same as circuit)
    rotationMatrix.makeRotationX(-Math.PI / 2);

    // Apply custom rotation if provided
    if (rotation !== undefined) {
      const customRotation = new THREE.Matrix4().makeRotationZ(rotation);
      rotationMatrix.multiply(customRotation);
    }

    transformedPoints = transformedPoints.map((point) => {
      return point.applyMatrix4(rotationMatrix);
    });

    return transformedPoints;
  }

  /**
   * Get position on the racing line at normalized distance t (0-1).
   * @param t - Normalized position along the curve (0 = start, 1 = end/loop back to start)
   * @returns Position vector at t
   */
  getPositionAt(t: number): THREE.Vector3 {
    if (!this.curve) {
      throw new Error('Racing line not loaded. Call load() first.');
    }
    return this.curve.getPointAt(t);
  }

  /**
   * Get tangent (direction) at normalized distance t (0-1).
   * Useful for orienting cars along the racing line.
   * @param t - Normalized position along the curve
   * @returns Normalized tangent vector at t
   */
  getTangentAt(t: number): THREE.Vector3 {
    if (!this.curve) {
      throw new Error('Racing line not loaded. Call load() first.');
    }
    return this.curve.getTangentAt(t).normalize();
  }

  /**
   * Get rotation matrix for orienting an object along the racing line.
   * @param t - Normalized position along the curve
   * @param upVector - Up vector (default: Y-up)
   * @returns Rotation matrix
   */
  getRotationMatrixAt(t: number, upVector: THREE.Vector3 = new THREE.Vector3(0, 1, 0)): THREE.Matrix4 {
    const point = this.getPositionAt(t);
    const tangent = this.getTangentAt(t);
    const target = point.clone().add(tangent);

    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.lookAt(point, target, upVector);

    return rotationMatrix;
  }

  /**
   * Get quaternion rotation for orienting an object along the racing line.
   * @param t - Normalized position along the curve
   * @returns Quaternion rotation
   */
  getQuaternionAt(t: number): THREE.Quaternion {
    const matrix = this.getRotationMatrixAt(t);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromRotationMatrix(matrix);
    return quaternion;
  }

  /**
   * Place a 3D object on the racing line at position t.
   * @param object - The Three.js object to position
   * @param t - Normalized position (0-1)
   * @param heightOffset - Optional height offset above the racing line
   */
  placeObjectAt(object: THREE.Object3D, t: number, heightOffset: number = 0): void {
    const position = this.getPositionAt(t);
    object.position.copy(position);

    if (heightOffset !== 0) {
      object.position.y += heightOffset;
    }

    const rotationMatrix = this.getRotationMatrixAt(t);
    object.setRotationFromMatrix(rotationMatrix);
  }

  /**
   * Get a debug line to visualize the racing line in the scene.
   * @param color - Color of the debug line (default: blue)
   * @param lineWidth - Width of the line (default: 2)
   * @returns Line object to add to the scene
   */
  createDebugLine(color: number = 0x0000ff, lineWidth: number = 2): THREE.Line {
    if (!this.curve) {
      throw new Error('Racing line not loaded. Call load() first.');
    }

    // Get more points for a smoother debug visualization
    const points = this.curve.getPoints(this.points.length * 2);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: lineWidth,
    });

    const line = new THREE.Line(geometry, material);
    line.position.y += 0.2; // Slightly above track to be visible

    return line;
  }

  /**
   * Get the total number of points in the racing line.
   */
  getPointCount(): number {
    return this.points.length;
  }

  /**
   * Get the curve object directly (for advanced use cases).
   */
  getCurve(): THREE.CatmullRomCurve3 | null {
    return this.curve;
  }

  /**
   * Check if the racing line is loaded and ready to use.
   */
  isLoaded(): boolean {
    return this.curve !== null;
  }

  /**
   * Get the circuit name.
   */
  getCircuitName(): string {
    return this.circuitName;
  }
}

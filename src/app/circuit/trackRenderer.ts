/**
 * Track Renderer - Following reference solution approach
 * Reference: src/interfaces/race_replay.py build_track_from_example_lap()
 *
 * Renders track from telemetry data instead of STL files
 */
import * as THREE from 'three';

export interface TrackData {
  centerline: {
    x: number[];
    y: number[];
  };
  boundaries: {
    inner: { x: number[]; y: number[] };
    outer: { x: number[]; y: number[] };
  };
  bounds: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  drs_zones: Array<{
    start: { x: number; y: number; index: number };
    end: { x: number; y: number; index: number };
  }>;
  track_width: number;
}

export class TrackRenderer {
  private scene: THREE.Scene;
  private trackGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.trackGroup = new THREE.Group();
    this.trackGroup.name = 'track';
    this.scene.add(this.trackGroup);
  }

  loadTrack(trackData: TrackData): void {
    this.clear();
    this.renderTrackSurface(trackData);
    this.renderBoundaries(trackData.boundaries);
    console.log(`✓ Track rendered: ${trackData.centerline.x.length} points`);
  }

  private renderCenterline(centerline: { x: number[]; y: number[] }): void {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < centerline.x.length; i++) {
      points.push(new THREE.Vector3(centerline.x[i], 0.1, centerline.y[i]));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
      linewidth: 2,
    });

    const line = new THREE.Line(geometry, material);
    line.name = 'centerline';
    this.trackGroup.add(line);
  }

  private renderTrackSurface(trackData: TrackData): void {
    const { inner, outer } = trackData.boundaries;
    const vertices: number[] = [];
    const indices: number[] = [];
    const trackThickness = 2.0;

    let vertexIndex = 0;
    for (let i = 0; i < inner.x.length; i++) {
      vertices.push(inner.x[i], trackThickness, inner.y[i]);
      vertices.push(outer.x[i], trackThickness, outer.y[i]);
      vertices.push(inner.x[i], 0, inner.y[i]);
      vertices.push(outer.x[i], 0, outer.y[i]);

      if (i < inner.x.length - 1) {
        const base = vertexIndex * 4;
        indices.push(base, base + 4, base + 1);
        indices.push(base + 1, base + 4, base + 5);
        indices.push(base + 2, base + 3, base + 6);
        indices.push(base + 3, base + 7, base + 6);
        indices.push(base, base + 2, base + 4);
        indices.push(base + 2, base + 6, base + 4);
        indices.push(base + 1, base + 5, base + 3);
        indices.push(base + 3, base + 5, base + 7);
      }
      vertexIndex++;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x505050,
      roughness: 0.6,
      metalness: 0.4,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'track-surface';
    mesh.receiveShadow = true;
    this.trackGroup.add(mesh);
  }

  private renderBoundaries(boundaries: { inner: { x: number[]; y: number[] }; outer: { x: number[]; y: number[] } }): void {
    this.renderBoundaryLine(boundaries.inner, 0xffffff, 'inner-boundary');
    this.renderBoundaryLine(boundaries.outer, 0xffffff, 'outer-boundary');
  }

  private renderBoundaryLine(boundary: { x: number[]; y: number[] }, color: number, name: string): void {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < boundary.x.length; i++) {
      points.push(new THREE.Vector3(boundary.x[i], 0.5, boundary.y[i]));
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 6,
    });

    const line = new THREE.Line(geometry, material);
    line.name = name;
    this.trackGroup.add(line);
  }

  private renderDRSZones(trackData: TrackData): void {
    // Render DRS zones as colored sections on track
    // Reference: race_replay.py uses DRS zones from telemetry
    trackData.drs_zones.forEach((zone, index) => {
      const startIdx = zone.start.index;
      const endIdx = zone.end.index;

      // Create a colored strip for DRS zone
      const points: THREE.Vector3[] = [];
      for (let i = startIdx; i <= Math.min(endIdx, trackData.centerline.x.length - 1); i++) {
        points.push(new THREE.Vector3(trackData.centerline.x[i], 0.3, trackData.centerline.y[i]));
      }

      if (points.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: 0x00ff00, // Green for DRS
          linewidth: 5,
          transparent: true,
          opacity: 0.7,
        });

        const line = new THREE.Line(geometry, material);
        line.name = `drs-zone-${index}`;
        this.trackGroup.add(line);
      }
    });

    console.log(`✓ Rendered ${trackData.drs_zones.length} DRS zones`);
  }

  getBounds(): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    const box = new THREE.Box3().setFromObject(this.trackGroup);
    if (box.isEmpty()) return null;
    return { min: box.min, max: box.max };
  }

  clear(): void {
    while (this.trackGroup.children.length > 0) {
      const child = this.trackGroup.children[0];
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      this.trackGroup.remove(child);
    }
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.trackGroup);
  }
}

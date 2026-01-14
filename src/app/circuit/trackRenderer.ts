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
    this.renderDRSZones(trackData);
    console.log(`✓ Track rendered: ${trackData.centerline.x.length} points, ${trackData.drs_zones?.length || 0} DRS zones`);
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
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'track-surface';
    mesh.receiveShadow = true;
    this.trackGroup.add(mesh);
  }

  private renderBoundaries(boundaries: { inner: { x: number[]; y: number[] }; outer: { x: number[]; y: number[] } }): void {
    // Reference: track_color = (150, 150, 150) - grey for normal track
    this.renderBoundaryTube(boundaries.inner, 0x969696, 'inner-boundary', 15);
    this.renderBoundaryTube(boundaries.outer, 0x969696, 'outer-boundary', 15);
  }

  private renderBoundaryTube(boundary: { x: number[]; y: number[] }, color: number, name: string, radius: number): void {
    const points: THREE.Vector3[] = [];
    // Sample every nth point to reduce geometry complexity
    const step = Math.max(1, Math.floor(boundary.x.length / 500));
    for (let i = 0; i < boundary.x.length; i += step) {
      points.push(new THREE.Vector3(boundary.x[i], 10.0, boundary.y[i]));
    }
    // Ensure we include the last point
    if (points.length > 0) {
      const lastIdx = boundary.x.length - 1;
      points.push(new THREE.Vector3(boundary.x[lastIdx], 3.0, boundary.y[lastIdx]));
    }

    if (points.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(curve, points.length * 2, radius, 8, false);
    const material = new THREE.MeshBasicMaterial({ 
      color,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(tubeGeometry, material);
    mesh.name = name;
    this.trackGroup.add(mesh);
  }

  private renderDRSZones(trackData: TrackData): void {
    // Render DRS zones as bright green tubes on OUTER track edge
    // Reference: drs_color = (0, 255, 0) with line width 6
    if (!trackData.drs_zones || trackData.drs_zones.length === 0) {
      return;
    }

    const outer = trackData.boundaries.outer;
    const drsRadius = 25;
    const drsMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, // Bright green (0, 255, 0) - exactly like reference
    });

    trackData.drs_zones.forEach((zone, index) => {
      const startIdx = zone.start.index;
      const endIdx = zone.end.index;

      // Create green tube on OUTER boundary (thicker than track lines)
      const points: THREE.Vector3[] = [];
      const step = Math.max(1, Math.floor((endIdx - startIdx) / 100));
      for (let i = startIdx; i <= Math.min(endIdx, outer.x.length - 1); i += step) {
        // Slightly higher than boundary to overlay on top
        points.push(new THREE.Vector3(outer.x[i], 12.0, outer.y[i]));
      }
      // Ensure we include the end point
      if (endIdx < outer.x.length) {
        points.push(new THREE.Vector3(outer.x[endIdx], 12.0, outer.y[endIdx]));
      }

      if (points.length > 1) {
        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, points.length * 2, drsRadius, 8, false);
        
        const mesh = new THREE.Mesh(tubeGeometry, drsMaterial);
        mesh.name = `drs-zone-${index}`;
        this.trackGroup.add(mesh);
      }
    });

    console.log(`✓ Rendered ${trackData.drs_zones.length} DRS zones (green on outer edge)`);
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

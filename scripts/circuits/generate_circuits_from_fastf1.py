import fastf1
import numpy as np
from scipy.interpolate import interp1d
from stl import mesh
import json
import os
import sys

CACHE_DIR = "./fastf1_cache"
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

TRACK_WIDTH = 150.0
TRACK_HEIGHT = 10.0
INTERPOLATION_DISTANCE = 10.0

F1_CIRCUITS_2024 = [
    "Bahrain",
    "Saudi Arabia", 
    "Australia",
    "Japan",
    "China",
    "Miami",
    "Emilia Romagna",
    "Monaco",
    "Canada",
    "Spain",
    "Austria",
    "Great Britain",
    "Hungary",
    "Belgium",
    "Netherlands",
    "Italy",
    "Azerbaijan",
    "Singapore",
    "United States",
    "Mexico",
    "Brazil",
    "Las Vegas",
    "Qatar",
    "Abu Dhabi"
]


def get_circuit_telemetry(year: int, circuit: str) -> dict:
    try:
        print(f"\n{'='*60}")
        print(f"Fetching data for {circuit} {year}...")
        print(f"{'='*60}")
        
        session = fastf1.get_session(year, circuit, 'R')
        session.load()
        
        laps = session.laps
        fastest_lap = laps.pick_fastest()
        
        if fastest_lap is None:
            print(f"❌ No lap data found for {circuit}")
            return None
        
        driver = fastest_lap['Driver']
        print(f"📊 Using fastest lap from driver: {driver}")
        
        # Get telemetry data
        telemetry = fastest_lap.get_telemetry()
        
        # Extract coordinates
        distance = telemetry['Distance'].to_numpy()
        x = telemetry['X'].to_numpy()
        y = telemetry['Y'].to_numpy() 
        z = telemetry['Z'].to_numpy()
        
        # Interpolate for smoother curves
        if len(distance) < 2:
            print(f"❌ Not enough data points for {circuit}")
            return None
        
        # Get min and max distance
        min_distance = np.min(distance)
        max_distance = np.max(distance)
        
        # Try cubic spline interpolation first, fallback to linear if needed
        try:
            interp_x = interp1d(distance, x, kind='cubic')
            interp_y = interp1d(distance, y, kind='cubic')
            interp_z = interp1d(distance, z, kind='cubic')
            interpolation_type = 'cubic'
        except:
            # Fallback to linear if cubic fails (e.g., not enough points)
            print("⚠️  Using linear interpolation (cubic requires more points)")
            interp_x = interp1d(distance, x, kind='linear')
            interp_y = interp1d(distance, y, kind='linear')
            interp_z = interp1d(distance, z, kind='linear')
            interpolation_type = 'linear'
        
        # Generate new distance values at specified intervals
        # Start from min_distance, not 0, to avoid interpolation errors
        new_distance = np.arange(min_distance, max_distance, INTERPOLATION_DISTANCE)
        
        # Interpolate coordinates
        new_x = interp_x(new_distance)
        new_y = interp_y(new_distance)
        new_z = interp_z(new_distance)
        
        print(f"✓ Interpolation: {interpolation_type} ({len(new_distance)} points)")
        
        track_length = max_distance - min_distance
        print(f"✓ Telemetry data loaded: {len(new_x)} points")
        print(f"✓ Track length: {track_length:.0f} meters")
        
        return {
            'x': new_x,
            'y': new_y,
            'z': new_z,
            'circuit': circuit,
            'year': year,
            'length': track_length
        }
        
    except Exception as e:
        print(f"❌ Error fetching {circuit}: {e}")
        return None


def create_track_ribbon(x, y, z, width=TRACK_WIDTH, height=TRACK_HEIGHT):
    n_points = len(x)
    
    # Calculate tangent vectors along the path
    tangents = np.zeros((n_points, 3))
    for i in range(n_points):
        if i == n_points - 1:
            # Last point: use vector to first point (close the loop)
            tangents[i] = [x[0] - x[i], y[0] - y[i], z[0] - z[i]]
        else:
            tangents[i] = [x[i+1] - x[i], y[i+1] - y[i], z[i+1] - z[i]]
    
    # Normalize tangents
    tangent_lengths = np.sqrt(np.sum(tangents**2, axis=1))
    tangent_lengths[tangent_lengths == 0] = 1  # Avoid division by zero
    tangents = tangents / tangent_lengths[:, np.newaxis]
    
    # Calculate normal vectors (perpendicular to tangent, in XY plane)
    normals = np.zeros((n_points, 3))
    normals[:, 0] = -tangents[:, 1]  # Perpendicular in XY plane
    normals[:, 1] = tangents[:, 0]
    normals[:, 2] = 0
    
    # Normalize
    normal_lengths = np.sqrt(np.sum(normals**2, axis=1))
    normal_lengths[normal_lengths == 0] = 1
    normals = normals / normal_lengths[:, np.newaxis]
    
    # Create vertices for the ribbon (4 vertices per point: top-left, top-right, bottom-left, bottom-right)
    vertices_top_left = np.column_stack([x, y, z]) - normals * (width/2)
    vertices_top_right = np.column_stack([x, y, z]) + normals * (width/2)
    vertices_bottom_left = vertices_top_left - np.array([0, 0, height])
    vertices_bottom_right = vertices_top_right - np.array([0, 0, height])
    
    # Create faces (triangles)
    faces = []
    
    for i in range(n_points - 1):
        # Indices for current and next point
        curr_tl = i * 4 + 0
        curr_tr = i * 4 + 1
        curr_bl = i * 4 + 2
        curr_br = i * 4 + 3
        
        next_tl = (i + 1) * 4 + 0
        next_tr = (i + 1) * 4 + 1
        next_bl = (i + 1) * 4 + 2
        next_br = (i + 1) * 4 + 3
        
        # Top surface (2 triangles)
        faces.append([curr_tl, next_tl, curr_tr])
        faces.append([curr_tr, next_tl, next_tr])
        
        # Bottom surface (2 triangles)
        faces.append([curr_bl, curr_br, next_bl])
        faces.append([curr_br, next_br, next_bl])
        
        # Left side (2 triangles)
        faces.append([curr_tl, curr_bl, next_tl])
        faces.append([curr_bl, next_bl, next_tl])
        
        # Right side (2 triangles)
        faces.append([curr_tr, next_tr, curr_br])
        faces.append([curr_br, next_tr, next_br])
    
    # Close the loop (connect last point to first)
    last_tl = (n_points - 1) * 4 + 0
    last_tr = (n_points - 1) * 4 + 1
    last_bl = (n_points - 1) * 4 + 2
    last_br = (n_points - 1) * 4 + 3
    first_tl = 0
    first_tr = 1
    first_bl = 2
    first_br = 3
    
    # Top
    faces.append([last_tl, first_tl, last_tr])
    faces.append([last_tr, first_tl, first_tr])
    
    # Bottom
    faces.append([last_bl, last_br, first_bl])
    faces.append([last_br, first_br, first_bl])
    
    # Left
    faces.append([last_tl, last_bl, first_tl])
    faces.append([last_bl, first_bl, first_tl])
    
    # Right
    faces.append([last_tr, first_tr, last_br])
    faces.append([last_br, first_tr, first_br])
    
    # Combine all vertices
    all_vertices = np.vstack([
        vertices_top_left,
        vertices_top_right,
        vertices_bottom_left,
        vertices_bottom_right
    ])
    
    # Interleave vertices properly
    all_vertices_interleaved = np.zeros((n_points * 4, 3))
    for i in range(n_points):
        all_vertices_interleaved[i*4 + 0] = vertices_top_left[i]
        all_vertices_interleaved[i*4 + 1] = vertices_top_right[i]
        all_vertices_interleaved[i*4 + 2] = vertices_bottom_left[i]
        all_vertices_interleaved[i*4 + 3] = vertices_bottom_right[i]
    
    # Create mesh
    track_mesh = mesh.Mesh(np.zeros(len(faces), dtype=mesh.Mesh.dtype))
    
    for i, face in enumerate(faces):
        for j in range(3):
            track_mesh.vectors[i][j] = all_vertices_interleaved[face[j]]
    
    return track_mesh


def sanitize_filename(name: str) -> str:
    """Convert circuit name to valid filename."""
    # Remove special characters and spaces
    name = name.lower()
    name = name.replace(' ', '-')
    name = name.replace('/', '-')
    # Map some circuit names to match your existing naming
    name_mapping = {
        'saudi-arabia': 'saudi',
        'australia': 'australia',
        'japan': 'japon',
        'emilia-romagna': 'romagna',
        'spain': 'spanish',
        'austria': 'austrian',
        'great-britain': 'british',
        'hungary': 'hungarian',
        'belgium': 'belgique',
        'netherlands': 'dutch',
        'italy': 'italian',
        'singapore': 'singapour',
        'united-states': 'usa',
        'mexico': 'mexique',
        'brazil': 'brazilian',
        'las-vegas': 'usa-lv',
        'qatar': 'quatar',
        'abu-dhabi': 'abu-dhabi',
        'china': 'chinesse',
        'bahrain': 'bahrain',
        'miami': 'miami',
        'canada': 'canadian',
        'azerbaijan': 'azerbaijan',
        'monaco': 'monaco'
    }
    
    return name_mapping.get(name, name)


def save_circuit_stl(telemetry_data: dict, output_dir: str):
    """
    Generate and save an STL file from telemetry data.
    
    Args:
        telemetry_data: Dictionary with x, y, z coordinates
        output_dir: Directory to save the STL file
    """
    if telemetry_data is None:
        return False
    
    circuit_name = telemetry_data['circuit']
    x = telemetry_data['x']
    y = telemetry_data['y']
    z = telemetry_data['z']
    
    print(f"\n🏗️  Generating 3D mesh for {circuit_name}...")
    
    # Create the track mesh
    track_mesh = create_track_ribbon(x, y, z)
    
    # Save to STL
    filename = sanitize_filename(circuit_name)
    output_path = os.path.join(output_dir, f"{filename}.stl")
    
    print(f"💾 Saving STL to {output_path}...")
    track_mesh.save(output_path)
    
    print(f"✅ Successfully saved {circuit_name} STL!")
    print(f"   - Vertices: {len(track_mesh.vectors) * 3}")
    print(f"   - Triangles: {len(track_mesh.vectors)}")
    
    return True


def save_circuit_centerline(telemetry_data: dict, output_dir: str):
    """
    Save centerline data as JSON for CatmullRomCurve3 in Three.js.
    
    Args:
        telemetry_data: Dictionary with x, y, z coordinates
        output_dir: Directory to save the JSON file
    """
    if telemetry_data is None:
        return False
    
    circuit_name = telemetry_data['circuit']
    x = telemetry_data['x']
    y = telemetry_data['y']
    z = telemetry_data['z']
    
    print(f"📍 Generating centerline data for {circuit_name}...")
    
    # Create centerline data as list of [x, y, z] coordinates
    centerline_data = [
        [float(x[i]), float(y[i]), float(z[i])] 
        for i in range(len(x))
    ]
    
    # Save to JSON
    filename = sanitize_filename(circuit_name)
    output_path = os.path.join(output_dir, f"{filename}_centerline.json")
    
    print(f"💾 Saving centerline to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(centerline_data, f, indent=2)
    
    print(f"✅ Successfully saved {circuit_name} centerline!")
    print(f"   - Points: {len(centerline_data)}")
    print(f"   - Track length: {telemetry_data['length']:.0f}m")
    
    return True


def main():
    """Main function to generate all circuits."""
    print("""
╔═══════════════════════════════════════════════════════════════╗
║         F1 Circuit Generator - FastF1 Telemetry Data          ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # Output directory
    output_dir = "../public/assets/circuits/generated"
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"📁 Output directory: {output_dir}")
    print(f"📏 Track width: {TRACK_WIDTH}m")
    print(f"📏 Track height: {TRACK_HEIGHT}m")
    print(f"🔍 Interpolation distance: {INTERPOLATION_DISTANCE}m")
    
    # Track statistics
    successful = 0
    failed = 0
    failed_circuits = []
    
    # Process each circuit
    for circuit in F1_CIRCUITS_2024:
        try:
            # Get telemetry data
            telemetry = get_circuit_telemetry(2024, circuit)
            
            if telemetry:
                # Generate and save STL
                stl_success = save_circuit_stl(telemetry, output_dir)
                
                # Generate and save centerline JSON
                centerline_success = save_circuit_centerline(telemetry, output_dir)
                
                if stl_success and centerline_success:
                    successful += 1
                else:
                    failed += 1
                    failed_circuits.append(circuit)
            else:
                failed += 1
                failed_circuits.append(circuit)
                
        except KeyboardInterrupt:
            print("\n\n⚠️  Process interrupted by user")
            break
        except Exception as e:
            print(f"\n❌ Unexpected error for {circuit}: {e}")
            failed += 1
            failed_circuits.append(circuit)
    
    # Print summary
    print(f"\n\n{'='*60}")
    print("📊 GENERATION SUMMARY")
    print(f"{'='*60}")
    print(f"✅ Successful: {successful}/{len(F1_CIRCUITS_2024)}")
    print(f"❌ Failed: {failed}/{len(F1_CIRCUITS_2024)}")
    
    if failed_circuits:
        print(f"\n⚠️  Failed circuits:")
        for circuit in failed_circuits:
            print(f"   - {circuit}")
    
    print(f"\n💡 Next steps:")
    print(f"   1. Check the generated files in: {output_dir}")
    print(f"      - *.stl files: 3D circuit meshes for visualization")
    print(f"      - *_centerline.json files: Racing lines for car movement")
    print(f"   2. Compare with your existing circuits")
    print(f"   3. Add them to your circuitDiscovery.ts file")
    print(f"   4. Use centerline JSON for CatmullRomCurve3 in Three.js")
    print(f"   5. These circuits don't have curbstones yet - add them procedurally in Three.js")
    
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()


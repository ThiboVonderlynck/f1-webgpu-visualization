#!/usr/bin/env python3
"""
Fetch F1 race telemetry data and export to MessagePack
Following reference solution pattern with defensive programming
"""
import sys
import json
import os
import msgpack
from lib.f1_data import (
    load_session,
    get_race_telemetry,
    enable_cache,
    get_driver_colors
)
from lib.track import build_track_from_telemetry

def export_race_data(year, round_number, session_type='R'):
    """Fetch and export race data (reference solution pattern)"""
    try:
        print(f"\n{'='*60}")
        print(f"Fetching F1 Data: {year} Round {round_number} ({session_type})")
        print(f"{'='*60}\n")
        
        # Enable caching
        enable_cache()
        
        # Load session
        session = load_session(year, round_number, session_type)
        event_name = session.event['EventName']
        
        # Get telemetry (uses multiprocessing + caching)
        telemetry_data = get_race_telemetry(session, session_type=session_type)
        
        # Get grid telemetry (start of race for orientation and grid line)
        grid_telemetry = None
        try:
            drivers = session.laps['Driver'].unique()
            if len(drivers) > 0:
                grid_lap = session.laps.pick_drivers(drivers[0]).pick_laps(1)
                if not grid_lap.empty:
                    grid_telemetry = grid_lap.get_telemetry()
        except:
            pass
        
        # Get track data from fastest lap (reference: main.py line 42-67)
        print("Extracting track layout from fastest lap...")
        track_data = None
        try:
            # Try qualifying session first (has DRS data)
            try:
                quali_session = load_session(year, round_number, 'Q')
                fastest_quali = quali_session.laps.pick_fastest()
                if fastest_quali is not None:
                    quali_telemetry = fastest_quali.get_telemetry()
                    if 'DRS' in quali_telemetry.columns:
                        track_data = build_track_from_telemetry(quali_telemetry, grid_telemetry=grid_telemetry)
                        print(f"✓ Track data from qualifying lap (driver {fastest_quali['Driver']})")
            except:
                pass
            
            # Fallback: use fastest race lap
            if track_data is None:
                fastest_lap = session.laps.pick_fastest()
                if fastest_lap is not None:
                    race_telemetry = fastest_lap.get_telemetry()
                    track_data = build_track_from_telemetry(race_telemetry, grid_telemetry=grid_telemetry)
                    print("✓ Track data from fastest race lap")
        except Exception as e:
            print(f"Warning: Could not extract track data: {e}")
        
        # Add track data to telemetry export
        if track_data:
            telemetry_data['track'] = track_data
        
        # Prepare output directory (following reference solution pattern)
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        output_dir = os.path.join(project_root, 'public', 'data', 'telemetry', str(year))
        os.makedirs(output_dir, exist_ok=True)
        
        # Create output filename (reference: event name normalized)
        # Reference uses: str(session).replace(' ', '_') 
        # We'll use a simpler format: round-eventname_session.json
        session_suffixes = {
            'Q': 'qualifying',
            'R': 'race',
            'S': 'sprint',
            'SQ': 'sprint-qualifying'
        }
        session_suffix = session_suffixes.get(session_type, 'race')
        safe_event_name = event_name.lower().replace(' ', '-').replace("'", "")
        output_file = os.path.join(
            output_dir,
            f"{round_number:02d}-{safe_event_name}_{session_suffix}.msgpack"
        )
            
        # Write MessagePack (binary format, much faster than JSON)
        print(f"\nWriting to: {output_file}")
        with open(output_file, 'wb') as f:
            msgpack.pack(telemetry_data, f, use_bin_type=True)
        
        file_size_mb = os.path.getsize(output_file) / (1024 * 1024)
        frames_count = len(telemetry_data['telemetry']['frames'])
        
        print(f"\n{'='*60}")
        print(f"✓ SUCCESS!")
        print(f"{'='*60}")
        print(f"  Event: {event_name}")
        print(f"  File: {os.path.basename(output_file)}")
        print(f"  Size: {file_size_mb:.2f} MB")
        print(f"  Frames: {frames_count:,}")
        print(f"  Drivers: {len(telemetry_data.get('driver_colors', {}))}")
        print(f"{'='*60}\n")
        
        # Output JSON for Node.js to parse (for programmatic use)
        result = {
            "success": True,
            "file": output_file,
            "event_name": event_name,
            "frames": frames_count,
            "size_mb": round(file_size_mb, 2)
        }
        print(f"__OUTPUT_JSON__:{json.dumps(result)}")
        
        return output_file
            
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"✗ ERROR: {e}")
        print(f"{'='*60}\n")
        raise

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python fetch_race_data.py <year> <round> [session_type]")
        print("Example: python fetch_race_data.py 2024 1 R")
        print("\nSession types:")
        print("  R  = Race (default)")
        print("  Q  = Qualifying")
        print("  S  = Sprint")
        print("  SQ = Sprint Qualifying")
        sys.exit(1)
    
    year = int(sys.argv[1])
    round_number = int(sys.argv[2])
    session_type = sys.argv[3] if len(sys.argv) > 3 else 'R'
    
    export_race_data(year, round_number, session_type)

#!/usr/bin/env python3
"""
Fetch F1 race telemetry data and export to JSON for use in the web app.

Usage:
    python fetch_race_data.py 2024 1          # Bahrain 2024 race
    python fetch_race_data.py 2024 1 Q        # Bahrain 2024 qualifying
"""

import sys
import json
import os
from f1_data import load_session, get_race_telemetry, enable_cache, get_driver_colors

def export_race_data(year, round_number, session_type='R'):
    """
    Fetch race data and export to JSON format for the web app.
    """
    print(f"Fetching {session_type} data for {year} Round {round_number}...")
    
    # Enable caching
    enable_cache()
    
    # Load session
    session = load_session(year, round_number, session_type)
    
    event_name = session.event['EventName']
    print(f"Loaded: {event_name}")
    
    # Get telemetry data
    telemetry = get_race_telemetry(session, session_type=session_type)
    
    # Get driver colors
    colors = get_driver_colors(session)
    
    # Prepare output directory
    output_dir = f"../../public/data/telemetry/{year}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Create output filename
    session_suffix = 'qualifying' if session_type == 'Q' else 'race'
    output_file = f"{output_dir}/{round_number:02d}-{event_name.lower().replace(' ', '-')}_{session_suffix}.json"
    
    # Export data directly (telemetry is already in the right format from f1_data.py)
    output_data = {
        "metadata": {
            "year": year,
            "round": round_number,
            "eventName": event_name,
            "sessionType": session_type,
            "driverColors": {driver: list(rgb) for driver, rgb in colors.items()},
        },
        "telemetry": telemetry
    }
    
    # Write to JSON
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"✓ Data exported to: {output_file}")
    
    # Print available keys for debugging
    if isinstance(telemetry, dict):
        print(f"  Data keys: {', '.join(telemetry.keys())}")
    
    return output_file

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python fetch_race_data.py <year> <round> [session_type]")
        print("Example: python fetch_race_data.py 2024 1")
        print("         python fetch_race_data.py 2024 1 Q")
        sys.exit(1)
    
    year = int(sys.argv[1])
    round_number = int(sys.argv[2])
    session_type = sys.argv[3] if len(sys.argv) > 3 else 'R'
    
    export_race_data(year, round_number, session_type)

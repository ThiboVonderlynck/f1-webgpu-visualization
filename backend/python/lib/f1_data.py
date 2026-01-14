import os
import sys
import fastf1
import fastf1.plotting
from multiprocessing import Pool, cpu_count
import numpy as np
import json
from datetime import timedelta

from .tyres import get_tyre_compound_int
from .time import parse_time_string, format_time

import pandas as pd

FPS = 25
DT = 1 / FPS

def enable_cache():
    """Enable FastF1 caching (centralized in backend/python/.fastf1-cache)"""
    lib_dir = os.path.dirname(os.path.abspath(__file__))
    python_root = os.path.dirname(lib_dir)
    cache_dir = os.path.join(python_root, '.fastf1-cache')
    
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(cache_dir)

def _process_single_driver(args):
    """Process telemetry data for a single driver (must be top-level for multiprocessing)"""
    driver_no, session, driver_code = args
    
    print(f"Getting telemetry for driver: {driver_code}")
    
    try:
        laps_driver = session.laps.pick_drivers(driver_no)
        if laps_driver.empty:
            print(f"No laps found for driver {driver_code}")
            return None

        driver_max_lap = laps_driver.LapNumber.max() if not laps_driver.empty else 0

        t_all = []
        x_all = []
        y_all = []
        dist_all = []
        rel_dist_all = []
        lap_numbers = []
        tyre_compounds = []
        speed_all = []
        gear_all = []
        drs_all = []
        throttle_all = []
        brake_all = []

        # Iterate laps in order
        for _, lap in laps_driver.iterlaps():
            try:
                lap_tel = lap.get_telemetry()
                
                if lap_tel.empty:
                    continue

                t_lap = lap_tel["SessionTime"].dt.total_seconds().to_numpy()
                x_lap = lap_tel["X"].to_numpy()
                y_lap = lap_tel["Y"].to_numpy()
                dist_lap = lap_tel["Distance"].to_numpy()
                rel_dist_lap = lap_tel["RelativeDistance"].to_numpy()
                speed_lap = lap_tel["Speed"].to_numpy()
                gear_lap = lap_tel["nGear"].to_numpy()
                drs_lap = lap_tel["DRS"].to_numpy()
                throttle_lap = lap_tel["Throttle"].to_numpy()
                brake_lap = lap_tel["Brake"].to_numpy()
                
                lap_number = lap['LapNumber']
                tyre_compound = get_tyre_compound_int(lap['Compound'])
                
                t_all.append(t_lap)
                x_all.append(x_lap)
                y_all.append(y_lap)
                dist_all.append(dist_lap)
                rel_dist_all.append(rel_dist_lap)
                lap_numbers.append(np.full_like(t_lap, lap_number))
                tyre_compounds.append(np.full_like(t_lap, tyre_compound))
                speed_all.append(speed_lap)
                gear_all.append(gear_lap)
                drs_all.append(drs_lap)
                throttle_all.append(throttle_lap)
                brake_all.append(brake_lap)
                
            except Exception as e:
                print(f"Error processing lap for {driver_code}: {e}")
                continue

        if not t_all:
            print(f"No valid telemetry for {driver_code}")
            return None

        # Concatenate and sort
        all_arrays = [t_all, x_all, y_all, dist_all, rel_dist_all, lap_numbers, 
                      tyre_compounds, speed_all, gear_all, drs_all, throttle_all, brake_all]
        t_all, x_all, y_all, dist_all, rel_dist_all, lap_numbers, \
        tyre_compounds, speed_all, gear_all, drs_all, throttle_all, brake_all = [np.concatenate(arr) for arr in all_arrays]
        
        order = np.argsort(t_all)
        all_data = [t_all, x_all, y_all, dist_all, rel_dist_all, lap_numbers,
                    tyre_compounds, speed_all, gear_all, drs_all, throttle_all, brake_all]
        t_all, x_all, y_all, dist_all, rel_dist_all, lap_numbers, \
        tyre_compounds, speed_all, gear_all, drs_all, throttle_all, brake_all = [arr[order] for arr in all_data]

        print(f"Completed telemetry for driver: {driver_code}")
        
        return {
            "code": driver_code,
            "data": {
                "t": t_all,
                "x": x_all,
                "y": y_all,
                "dist": dist_all,
                "rel_dist": rel_dist_all,
                "lap": lap_numbers,
                "tyre": tyre_compounds,
                "speed": speed_all,
                "gear": gear_all,
                "drs": drs_all,
                "throttle": throttle_all,
                "brake": brake_all,
            },
            "t_min": float(t_all.min()),
            "t_max": float(t_all.max()),
            "max_lap": int(driver_max_lap)
        }
        
    except Exception as e:
        print(f"Failed to process driver {driver_code}: {e}")
        return None

def load_session(year, round_number, session_type='R'):
    """Load an F1 session with error handling"""
    try:
        print(f"Loading session: {year} Round {round_number} ({session_type})")
        session = fastf1.get_session(year, round_number, session_type)
        session.load(telemetry=True, weather=False)
        print(f"✓ Session loaded: {session.event['EventName']}")
        return session
    except Exception as e:
        print(f"Error loading session: {e}")
        raise

def get_driver_colors(session):
    """Get driver colors (reference solution pattern)"""
    try:
        color_mapping = fastf1.plotting.get_driver_color_mapping(session)
        
        # Convert hex to RGB tuples
        rgb_colors = {}
        for driver, hex_color in color_mapping.items():
            hex_color = hex_color.lstrip('#')
            rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            rgb_colors[driver] = rgb
        return rgb_colors
    except Exception as e:
        print(f"Error getting driver colors: {e}")
        return {}

def get_circuit_rotation(session):
    """Get circuit rotation from FastF1"""
    try:
        circuit = session.get_circuit_info()
        return circuit.rotation
    except Exception as e:
        print(f"Error getting circuit rotation: {e}")
        return 0

def get_race_telemetry(session, session_type='R', use_cache=True):
    """
    Get telemetry for all drivers (reference solution pattern)
    Returns data structure ready for JSON export
    """
    event_name = str(session).replace(' ', '_')
    cache_suffix = 'sprint' if session_type == 'S' else 'race'
    
    # Check cache (JSON instead of pickle)
    lib_dir = os.path.dirname(os.path.abspath(__file__))
    python_root = os.path.dirname(lib_dir)
    cache_dir = os.path.join(python_root, 'computed_data')
    cache_file = f"{cache_dir}/{event_name}_{cache_suffix}_telemetry.json"
    
    if use_cache and os.path.exists(cache_file):
        try:
            print(f"Loading cached data from {cache_file}")
            with open(cache_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Cache load failed: {e}")
    
    # Process data
    print(f"Processing telemetry for {event_name}...")
    
    drivers = session.drivers
    driver_codes = {
        num: session.get_driver(num)["Abbreviation"]
        for num in drivers
    }
    
    driver_data = {}
    global_t_min = None
    global_t_max = None
    max_lap_number = 0
    
    # Multiprocessing (reference solution pattern)
    print(f"Processing {len(drivers)} drivers in parallel...")
    driver_args = [(driver_no, session, driver_codes[driver_no]) for driver_no in drivers]
    num_processes = min(cpu_count(), len(drivers))
    
    with Pool(processes=num_processes) as pool:
        results = pool.map(_process_single_driver, driver_args)
    
    # Process results
    for result in results:
        if result is None:
            continue
        
        code = result["code"]
        driver_data[code] = result["data"]
        
        t_min = result["t_min"]
        t_max = result["t_max"]
        max_lap_number = max(max_lap_number, result["max_lap"])
        
        global_t_min = t_min if global_t_min is None else min(global_t_min, t_min)
        global_t_max = t_max if global_t_max is None else max(global_t_max, t_max)
    
    if not driver_data:
        raise ValueError("No valid telemetry data found")
    
    # Create timeline
    timeline = np.arange(global_t_min, global_t_max, DT) - global_t_min
    
    # Resample data
    resampled_data = {}
    for code, data in driver_data.items():
        t = data["t"] - global_t_min
        order = np.argsort(t)
        
        # Sort all arrays
        arrays_to_resample = [
            data["x"], data["y"], data["dist"], data["rel_dist"], data["lap"],
            data["tyre"], data["speed"], data["gear"], data["drs"],
            data["throttle"], data["brake"]
        ]
        sorted_arrays = [arr[order] for arr in arrays_to_resample]
        t_sorted = t[order]
        
        # Interpolate numerical values
        resampled = [np.interp(timeline, t_sorted, arr) for arr in sorted_arrays]
        x_resampled, y_resampled, dist_resampled, rel_dist_resampled, lap_resampled, \
        tyre_resampled, speed_resampled, gear_resampled, drs_resampled, \
        throttle_resampled, brake_resampled = resampled
        
        resampled_data[code] = {
            "t": timeline,
            "x": x_resampled,
            "y": y_resampled,
            "dist": dist_resampled,
            "rel_dist": rel_dist_resampled,
            "lap": lap_resampled,
            "tyre": tyre_resampled,
            "speed": speed_resampled,
            "gear": gear_resampled,
            "drs": drs_resampled,
            "throttle": throttle_resampled,
            "brake": brake_resampled,
        }
    
    # Build frames with position calculation
    frames = []
    for i in range(len(timeline)):
        t = timeline[i]
        
        # Calculate positions based on distance
        driver_positions = []
        for code, d in resampled_data.items():
            driver_positions.append((code, float(d["dist"][i])))
        
        # Sort by distance (descending) to get positions
        driver_positions.sort(key=lambda x: x[1], reverse=True)
        position_map = {code: pos + 1 for pos, (code, _) in enumerate(driver_positions)}
        
        frame_data = {}
        for code, d in resampled_data.items():
            frame_data[code] = {
                "x": round(float(d["x"][i]), 2),
                "y": round(float(d["y"][i]), 2),
                "dist": round(float(d["dist"][i]), 2),
                "rel_dist": round(float(d["rel_dist"][i]), 4),
                "lap": int(round(d["lap"][i])),
                "tyre": int(round(d["tyre"][i])),
                "speed": round(float(d["speed"][i]), 1),
                "gear": int(round(d["gear"][i])),
                "drs": int(round(d["drs"][i])),
                "throttle": round(float(d["throttle"][i]), 1),
                "brake": round(float(d["brake"][i]), 1),
                "position": position_map[code],
            }
        
        # Calculate leader's lap for the frame
        leader_lap = max(int(round(d["lap"][i])) for d in resampled_data.values())
        
        frames.append({
            "t": round(float(t), 3),
            "lap": leader_lap,
            "drivers": frame_data
        })
    
    print(f"Completed telemetry extraction: {len(frames)} frames")
    
    # Prepare output
    result = {
        "telemetry": {
            "frames": frames
        },
        "driver_colors": get_driver_colors(session),
        "total_laps": int(max_lap_number),
    }
    
    # Save cache
    if use_cache:
        try:
            os.makedirs(cache_dir, exist_ok=True)
            print(f"Saving cache to {cache_file}...")
            with open(cache_file, 'w') as f:
                json.dump(result, f, separators=(',', ':'))
            print("✓ Cache saved")
        except Exception as e:
            print(f"Cache save failed: {e}")
    
    return result

def get_race_weekends_by_year(year):
    """Get list of race weekends for a year"""
    try:
        enable_cache()
        schedule = fastf1.get_event_schedule(year)
        weekends = []
        
        for _, event in schedule.iterrows():
            if event.is_testing():
                continue
            
            weekends.append({
                "round_number": int(event['RoundNumber']),
                "event_name": event['EventName'],
                "date": str(event['EventDate'].date()),
                "country": event['Country'],
                "type": event['EventFormat'],
            })
        
        return weekends
    except Exception as e:
        print(f"Error getting race weekends: {e}")
        return []

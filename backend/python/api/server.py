#!/usr/bin/env python3
"""
Flask API for F1 Data Selection
Following reference solution pattern for race/session selection
"""
import os
import sys

# Add parent directory to path FIRST (before any lib imports)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Run cache health check BEFORE importing fastf1 (which is imported by f1_data)
# This detects and auto-clears corrupted cache that causes slow imports
from lib.cache_manager import check_cache_health
check_cache_health()

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime

from lib.f1_data import get_race_weekends_by_year, enable_cache

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Enable FastF1 cache on startup
enable_cache()

@app.route('/api/years', methods=['GET'])
def api_years():
    """
    Get list of available years
    Reference: cli_race_selection.py line 22
    """
    try:
        current_year = datetime.now().year
        # FastF1 data available from 2018 onwards (reliable)
        years = list(range(current_year, 2017, -1))
        return jsonify({
            'success': True,
            'years': years
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/races', methods=['GET'])
def api_races():
    """
    Get list of races for a given year
    Reference: cli_race_selection.py line 35-38
    """
    year = request.args.get('year', type=int)
    
    if not year:
        return jsonify({
            'success': False,
            'error': 'Year parameter is required'
        }), 400
    
    try:
        print(f"Fetching races for {year}...")
        races = get_race_weekends_by_year(year)
        
        # Format for frontend (matching reference CLI output)
        formatted_races = [{
            'round': race['round_number'],
            'name': race['event_name'],
            'date': race['date'],
            'country': race['country'],
            'type': race['type']  # 'conventional' or 'sprint'
        } for race in races]
        
        print(f"✓ Found {len(formatted_races)} races for {year}")
        
        return jsonify({
            'success': True,
            'races': formatted_races
        })
    except Exception as e:
        print(f"Error fetching races: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/sessions', methods=['GET'])
def api_sessions():
    """
    Get available session types for a specific race
    Reference: cli_race_selection.py line 42-47
    """
    year = request.args.get('year', type=int)
    round_number = request.args.get('round', type=int)
    
    if not year or not round_number:
        return jsonify({
            'success': False,
            'error': 'Year and round parameters are required'
        }), 400
    
    try:
        # Get race data to determine if it's a sprint weekend
        races = get_race_weekends_by_year(year)
        race = next((r for r in races if r['round_number'] == round_number), None)
        
        if not race:
            return jsonify({
                'success': False,
                'error': f'Race not found for year {year} round {round_number}'
            }), 404
        
        # Base sessions (always available) - Reference pattern
        sessions = [
            {'code': 'Q', 'name': 'Qualifying'},
            {'code': 'R', 'name': 'Race'}
        ]
        
        # Add sprint sessions if sprint weekend
        # Reference: cli_race_selection.py line 43-47
        event_type = (race['type'] or '').lower()
        if 'sprint' in event_type:
            sessions.insert(0, {'code': 'SQ', 'name': 'Sprint Qualifying'})
            sessions.insert(2, {'code': 'S', 'name': 'Sprint'})
        
        return jsonify({
            'success': True,
            'sessions': sessions,
            'is_sprint': 'sprint' in event_type
        })
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'F1 Python API',
        'cache_enabled': True
    })

if __name__ == '__main__':
    PORT = 3002
    print("\n" + "="*60)
    print(f"🏎️  F1 Python API Server")
    print("="*60)
    print(f"Port: {PORT}")
    print(f"FastF1 Cache: Enabled")
    print("\nEndpoints:")
    print(f"  GET  /api/years")
    print(f"  GET  /api/races?year=2024")
    print(f"  GET  /api/sessions?year=2024&round=1")
    print(f"  GET  /health")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=PORT, debug=True)

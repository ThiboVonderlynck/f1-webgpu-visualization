#!/usr/bin/env python3
"""
Flask API server for F1 data endpoints.
Provides dynamic data for years, races, and session types using FastF1.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
from datetime import datetime

# Add parent directory to path to import f1_data
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from f1_data import get_race_weekends_by_year, enable_cache

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Enable FastF1 cache
enable_cache()


def get_available_years():
    """Get list of available years (2010 to current year)."""
    current_year = datetime.now().year
    return list(range(2010, current_year + 1))


def get_session_types_for_race(year, round_number):
    """
    Get available session types for a specific race.
    Based on the event format, determines which sessions are available.
    """
    try:
        weekends = get_race_weekends_by_year(year)
        event = next((w for w in weekends if w['round_number'] == round_number), None)
        
        if not event:
            return []
        
        event_type = (event.get('type') or '').lower()
        sessions = []
        
        # Always available sessions
        sessions.append({'id': 'Q', 'name': 'Qualifying', 'code': 'Q'})
        sessions.append({'id': 'R', 'name': 'Race', 'code': 'R'})
        
        # Sprint sessions (if event has sprint format)
        if 'sprint' in event_type:
            # Sprint Qualifying (SQ) - available in sprint weekends
            sessions.insert(0, {'id': 'SQ', 'name': 'Sprint Qualifying', 'code': 'SQ'})
            # Sprint (S) - available in sprint weekends
            sessions.insert(1, {'id': 'S', 'name': 'Sprint', 'code': 'S'})
        
        return sessions
    except Exception as e:
        print(f"Error getting session types: {e}")
        return []


@app.route('/api/years', methods=['GET'])
def api_years():
    """Get list of available years."""
    try:
        years = get_available_years()
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
    """Get list of races for a given year."""
    year = request.args.get('year', type=int)
    
    if not year:
        return jsonify({
            'success': False,
            'error': 'Year parameter is required'
        }), 400
    
    try:
        weekends = get_race_weekends_by_year(year)
        races = []
        for weekend in weekends:
            races.append({
                'round': weekend['round_number'],
                'name': weekend['event_name'],
                'date': weekend['date'],
                'country': weekend['country'],
                'type': weekend['type']
            })
        
        return jsonify({
            'success': True,
            'races': races,
            'year': year
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/sessions', methods=['GET'])
def api_sessions():
    """Get available session types for a specific race."""
    year = request.args.get('year', type=int)
    round_number = request.args.get('round', type=int)
    
    if not year or not round_number:
        return jsonify({
            'success': False,
            'error': 'Year and round parameters are required'
        }), 400
    
    try:
        sessions = get_session_types_for_race(year, round_number)
        return jsonify({
            'success': True,
            'sessions': sessions,
            'year': year,
            'round': round_number
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})


if __name__ == '__main__':
    PORT = 3002  # Different port from Node.js server
    print(f'🏎️  F1 Python API server running on http://localhost:{PORT}')
    print(f'   Endpoints:')
    print(f'   - GET /api/years')
    print(f'   - GET /api/races?year=2024')
    print(f'   - GET /api/sessions?year=2024&round=1')
    app.run(host='0.0.0.0', port=PORT, debug=True)

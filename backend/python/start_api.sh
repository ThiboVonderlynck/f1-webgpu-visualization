#!/bin/bash
# Start the Python API server for F1 data endpoints

cd "$(dirname "$0")"
python api/server.py

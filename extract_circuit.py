"""
extract_circuit.py

One-time script to extract F1 circuit coordinates from FastF1
and save them as a static JSON file for the React app to import.

Usage:
  python3 scripts/extract_circuit.py --year 2024 --round 1 --output src/generated/circuit.json

The output JSON is imported directly into the RaceReplay component.
No FastF1 or Python needed at runtime — this runs once, you commit the JSON.

Requirements:
  pip install fastf1 numpy
"""

import argparse
import json
import os
import sys
import numpy as np

def extract_circuit(year: int, round_number: int, output_path: str, n_points: int = 500):
    try:
        import fastf1
    except ImportError:
        print("ERROR: fastf1 not installed. Run: pip install fastf1 numpy")
        sys.exit(1)

    cache_dir = os.path.join(os.path.dirname(__file__), "..", "f1-race-replay", ".fastf1-cache")
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir)
    fastf1.Cache.enable_cache(cache_dir)

    print(f"Loading session: {year} Round {round_number}...")
    session = fastf1.get_session(year, round_number, "R")
    session.load(telemetry=True, laps=True, weather=False, messages=False)

    print("Getting fastest lap telemetry for track outline...")
    fastest_lap = session.laps.pick_fastest()
    tel = fastest_lap.get_telemetry()

    raw_x = tel["X"].to_numpy().astype(float)
    raw_y = tel["Y"].to_numpy().astype(float)

    # Resample to n_points for a clean, consistent polyline
    t_old = np.linspace(0, 1, len(raw_x))
    t_new = np.linspace(0, 1, n_points)
    x_resampled = np.interp(t_new, t_old, raw_x).tolist()
    y_resampled = np.interp(t_new, t_old, raw_y).tolist()

    # Normalise coordinates to a 0-1 range so the SVG viewBox is consistent
    x_min, x_max = min(x_resampled), max(x_resampled)
    y_min, y_max = min(y_resampled), max(y_resampled)
    x_range = x_max - x_min or 1
    y_range = y_max - y_min or 1
    scale = max(x_range, y_range)

    points = [
        {
            "x": round((x - x_min) / scale, 6),
            "y": round((y - y_min) / scale, 6),
        }
        for x, y in zip(x_resampled, y_resampled)
    ]

    # Get circuit rotation from circuit_info (used to orient the SVG correctly)
    try:
        circuit_info = session.get_circuit_info()
        rotation_deg = float(circuit_info.rotation)
    except Exception:
        rotation_deg = 0.0

    # Circuit metadata
    circuit_key = session.event["EventName"]
    output = {
        "circuit_key": circuit_key,
        "year": year,
        "round": round_number,
        "rotation_deg": rotation_deg,
        "n_points": n_points,
        "x_min": x_min,
        "x_max": x_max,
        "y_min": y_min,
        "y_max": y_max,
        "points": points,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved {n_points} track points to {output_path}")
    print(f"Circuit: {circuit_key}, rotation: {rotation_deg}°")
    print(f"X range: {x_min:.0f} → {x_max:.0f}")
    print(f"Y range: {y_min:.0f} → {y_max:.0f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract F1 circuit coordinates to JSON")
    parser.add_argument("--year",   type=int, default=2024, help="F1 season year (default: 2024)")
    parser.add_argument("--round",  type=int, default=1,    help="Round number (default: 1 = Bahrain)")
    parser.add_argument("--output", type=str, default="src/generated/circuit.json", help="Output JSON path")
    parser.add_argument("--points", type=int, default=500,  help="Number of track outline points (default: 500)")
    args = parser.parse_args()

    extract_circuit(args.year, args.round, args.output, args.points)

"""
One-time script to extract F1 circuit coordinates from FastF1
and save them as a static JSON file for the React app to import.

Usage:
  python3 scripts/extract_circuit.py --year 2024 --round 1 --output src/generated/circuit.json
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
    os.makedirs(cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(cache_dir)

    print(f"Loading session: {year} Round {round_number}...")
    session = fastf1.get_session(year, round_number, "R")
    session.load(telemetry=True, laps=True, weather=False, messages=False)

    print("Getting fastest lap telemetry for track outline...")
    fastest_lap = session.laps.pick_fastest()
    telemetry = fastest_lap.get_telemetry()

    raw_x = telemetry["X"].to_numpy().astype(float)
    raw_y = telemetry["Y"].to_numpy().astype(float)

    t_old = np.linspace(0, 1, len(raw_x))
    t_new = np.linspace(0, 1, n_points)
    x_resampled = np.interp(t_new, t_old, raw_x).tolist()
    y_resampled = np.interp(t_new, t_old, raw_y).tolist()

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

    try:
        circuit_info = session.get_circuit_info()
        rotation_deg = float(circuit_info.rotation)
    except Exception:
        rotation_deg = 0.0

    output = {
        "circuit_key": session.event["EventName"],
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
    with open(output_path, "w", encoding="utf-8") as output_file:
        json.dump(output, output_file, indent=2)

    print(f"Saved {n_points} track points to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract F1 circuit coordinates to JSON")
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument("--round", type=int, default=1)
    parser.add_argument("--output", type=str, default="src/generated/circuit.json")
    parser.add_argument("--points", type=int, default=500)
    args = parser.parse_args()

    extract_circuit(args.year, args.round, args.output, args.points)

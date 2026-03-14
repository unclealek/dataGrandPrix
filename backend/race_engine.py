import random


def run_race_simulation(scorecard: dict, seed: int = 7) -> dict:
    rng = random.Random(seed)
    final_score = scorecard["summary"]["final_score"]
    remaining = scorecard["remaining_issues"]

    pace_bonus = final_score * 0.08
    duplicate_penalty = remaining["duplicate_driver_lap"] * 0.06
    null_penalty = (remaining["missing_lap_time"] + remaining["missing_tire_type"]) * 0.03
    schema_penalty = remaining["invalid_track_temp"] * 0.04
    fuel_penalty = remaining["negative_fuel_level"] * 0.08
    overclean_penalty = scorecard["summary"]["penalty"] * 0.05

    base_lap = 89.5
    avg_lap_time = base_lap - pace_bonus + duplicate_penalty + null_penalty + schema_penalty + fuel_penalty + overclean_penalty

    pit_stops = 0
    race_events = []
    if remaining["negative_fuel_level"] > 0:
        pit_stops += 1
        race_events.append(
            {
                "lap": 3,
                "type": "pit",
                "title": "Fuel model correction",
                "detail": "Negative fuel values triggered a safety pit stop.",
                "penalty_seconds": round(remaining["negative_fuel_level"] * 0.7, 2),
            }
        )
    if remaining["invalid_track_temp"] > 0:
        race_events.append(
            {
                "lap": 2,
                "type": "pace",
                "title": "Setup mismatch",
                "detail": "Mixed units hurt setup confidence through sector two.",
                "penalty_seconds": round(schema_penalty, 2),
            }
        )
    if scorecard["summary"]["penalty"] > 0:
        race_events.append(
            {
                "lap": 4,
                "type": "pace",
                "title": "Thin dataset",
                "detail": "Too much telemetry was removed, so the strategy model lost confidence.",
                "penalty_seconds": round(overclean_penalty, 2),
            }
        )

    laps = []
    cumulative = 0.0
    for lap_number in range(1, 6):
        variation = rng.uniform(-0.35, 0.35)
        lap_time = avg_lap_time + variation
        cumulative += lap_time
        laps.append(
            {
                "lap": lap_number,
                "lap_time": round(lap_time, 3),
                "cumulative_time": round(cumulative, 3),
            }
        )

    return {
        "driver": "player",
        "summary": {
            "base_lap": base_lap,
            "pace_bonus": round(pace_bonus, 2),
            "issue_penalties": round(duplicate_penalty + null_penalty + schema_penalty + fuel_penalty + overclean_penalty, 2),
            "pit_stops": pit_stops,
        },
        "laps": laps,
        "events": race_events,
        "pit_stops": pit_stops,
        "final_time": round(cumulative, 3),
    }

import pandas as pd


CATEGORY_WEIGHTS = {
    "null_handling": 30,
    "deduplication": 20,
    "schema_validation": 20,
    "normalization": 20,
    "outlier_control": 10,
}


def _issue_value(df: pd.DataFrame, column: str) -> int:
    return int(df[column].isna().sum()) if column in df.columns else len(df)


def analyze_issues(df: pd.DataFrame) -> dict:
    issues = {}

    issues["missing_lap_time"] = _issue_value(df, "lap_time")
    issues["missing_tire_type"] = _issue_value(df, "tire_type")

    if {"driver_id", "lap"}.issubset(df.columns):
        issues["duplicate_driver_lap"] = int(df.duplicated(subset=["driver_id", "lap"]).sum())
    else:
        issues["duplicate_driver_lap"] = len(df)

    if "track_temp" in df.columns:
        numeric_track_temp = pd.to_numeric(df["track_temp"], errors="coerce")
        issues["invalid_track_temp"] = int(numeric_track_temp.isna().sum())
    else:
        issues["invalid_track_temp"] = len(df)

    if "tire_type" in df.columns:
        normalized = df["tire_type"].dropna().astype(str).str.strip()
        valid_tires = {"Soft", "Medium", "Hard"}
        issues["inconsistent_tire_type"] = int((~normalized.isin(valid_tires)).sum())
    else:
        issues["inconsistent_tire_type"] = len(df)

    if "fuel_level" in df.columns:
        numeric_fuel = pd.to_numeric(df["fuel_level"], errors="coerce")
        issues["negative_fuel_level"] = int((numeric_fuel < 0).fillna(False).sum())
    else:
        issues["negative_fuel_level"] = len(df)

    issues["row_count"] = int(len(df))
    return issues


def _category_score(weight: int, baseline_count: int, remaining_count: int) -> int:
    if baseline_count <= 0:
        return weight

    improvement_ratio = 1 - (remaining_count / baseline_count)
    return max(0, min(weight, round(weight * improvement_ratio)))


def score_data(df_bronze: pd.DataFrame, df_gold: pd.DataFrame) -> dict:
    baseline = analyze_issues(df_bronze)
    current = analyze_issues(df_gold)

    categories = [
        {
            "key": "null_handling",
            "label": "Null handling",
            "weight": CATEGORY_WEIGHTS["null_handling"],
            "baseline": baseline["missing_lap_time"] + baseline["missing_tire_type"],
            "remaining": current["missing_lap_time"] + current["missing_tire_type"],
            "impact": "Missing telemetry creates unstable pace and timing gaps.",
        },
        {
            "key": "deduplication",
            "label": "Deduplication",
            "weight": CATEGORY_WEIGHTS["deduplication"],
            "baseline": baseline["duplicate_driver_lap"],
            "remaining": current["duplicate_driver_lap"],
            "impact": "Duplicate laps confuse the strategist and cost race rhythm.",
        },
        {
            "key": "schema_validation",
            "label": "Schema validation",
            "weight": CATEGORY_WEIGHTS["schema_validation"],
            "baseline": baseline["invalid_track_temp"],
            "remaining": current["invalid_track_temp"],
            "impact": "Bad units and types feed the wrong setup into the car.",
        },
        {
            "key": "normalization",
            "label": "Normalization",
            "weight": CATEGORY_WEIGHTS["normalization"],
            "baseline": baseline["inconsistent_tire_type"],
            "remaining": current["inconsistent_tire_type"],
            "impact": "Inconsistent labels break compound-level race strategy.",
        },
        {
            "key": "outlier_control",
            "label": "Outlier control",
            "weight": CATEGORY_WEIGHTS["outlier_control"],
            "baseline": baseline["negative_fuel_level"],
            "remaining": current["negative_fuel_level"],
            "impact": "Impossible fuel values trigger extra pit and pace penalties.",
        },
    ]

    scored_categories = []
    total_score = 0
    for category in categories:
        points = _category_score(category["weight"], category["baseline"], category["remaining"])
        total_score += points
        scored_categories.append(
            {
                **category,
                "points": points,
                "display": f"{points}/{category['weight']}",
                "resolved": max(category["baseline"] - category["remaining"], 0),
            }
        )

    row_count = len(df_gold)
    penalty = 0
    penalty_reason = None
    if row_count < 60:
        penalty = 15
        penalty_reason = "Gold table removed too many rows for a stable race run."
    elif row_count < 80:
        penalty = 5
        penalty_reason = "Gold table is a bit too aggressive and loses usable telemetry."

    final_score = max(0, total_score - penalty)

    return {
        "categories": scored_categories,
        "baseline_issues": baseline,
        "remaining_issues": current,
        "summary": {
            "total_score": total_score,
            "penalty": penalty,
            "final_score": final_score,
            "row_count": row_count,
            "baseline_row_count": len(df_bronze),
            "rows_removed": max(len(df_bronze) - row_count, 0),
            "penalty_reason": penalty_reason,
        },
    }

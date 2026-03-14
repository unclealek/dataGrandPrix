import pandas as pd
import random
import numpy as np


def generate_telemetry_dataset(seed: int = 7) -> pd.DataFrame:
    rng = random.Random(seed)
    np_rng = np.random.default_rng(seed)
    drivers = ['VER', 'HAM', 'LEC', 'NOR', 'ALO', 'SAI', 'RUS', 'PIA']
    tire_types = ['Soft', 'Medium', 'Hard']

    data = []

    # Generate 100 Base Rows
    for i in range(100):
        driver = rng.choice(drivers)
        lap = rng.randint(1, 50)
        base_lap_time = 80.0 + rng.uniform(0, 10)

        tire = rng.choice(tire_types)
        fuel = 100.0 - (lap * 1.5) + rng.uniform(-2, 2)
        track_temp = 30 + rng.randint(-5, 10)

        s1 = base_lap_time * 0.3 + rng.uniform(-0.5, 0.5)
        s2 = base_lap_time * 0.4 + rng.uniform(-0.5, 0.5)
        s3 = base_lap_time * 0.3 + rng.uniform(-0.5, 0.5)
        lap_time = s1 + s2 + s3
        pit_stop = rng.choice([True, False]) if lap % 20 == 0 else False

        data.append({
            'driver_id': driver,
            'lap': lap,
            'lap_time': round(lap_time, 3),
            'tire_type': tire,
            'fuel_level': round(fuel, 2),
            'track_temp': track_temp,
            'pit_stop': pit_stop,
            'sector1_time': round(s1, 3),
            'sector2_time': round(s2, 3),
            'sector3_time': round(s3, 3)
        })

    df = pd.DataFrame(data)

    # Introduce intentional messiness:
    # 1. Null values
    null_indices = np_rng.choice(df.index, size=10, replace=False)
    df.loc[null_indices[:5], 'lap_time'] = np.nan
    df.loc[null_indices[5:], 'tire_type'] = np.nan

    # 2. Duplicate rows
    duplicates = df.sample(5, random_state=seed)
    df = pd.concat([df, duplicates], ignore_index=True)

    # 3. Inconsistent casing
    case_indices = np_rng.choice(df.index, size=15, replace=False)
    for idx in case_indices:
        if pd.notna(df.loc[idx, 'tire_type']):
            df.loc[idx, 'tire_type'] = rng.choice([df.loc[idx, 'tire_type'].lower(), df.loc[idx, 'tire_type'].upper()])

    # 4. Mixed units
    df['track_temp'] = df['track_temp'].astype(object)
    temp_indices = np_rng.choice(df.index, size=15, replace=False)
    for idx in temp_indices:
        df.loc[idx, 'track_temp'] = f"{df.loc[idx, 'track_temp']}C"

    # 5. Negative values
    neg_indices = np_rng.choice(df.index, size=5, replace=False)
    for idx in neg_indices:
        df.loc[idx, 'fuel_level'] = -abs(df.loc[idx, 'fuel_level'])

    return df

if __name__ == '__main__':
    df = generate_telemetry_dataset()
    df.to_csv('telemetry_raw.csv', index=False)
    print("Dataset generated with", len(df), "rows.")

import raceDataset from "./generated/race_seed_20260315.json";
import type { RaceDataset } from "./types";

export const STARTER_SQL = `SELECT
  id,
  TRIM(first_name) AS first_name,
  TRIM(last_name) AS last_name,
  LOWER(TRIM(email)) AS email,
  CASE
    WHEN LOWER(TRIM(country)) IN ('uk', 'united kingdom') THEN 'United Kingdom'
    WHEN LOWER(TRIM(country)) IN ('usa', 'united states') THEN 'USA'
    ELSE TRIM(country)
  END AS country,
  signup_date,
  amount,
  LOWER(TRIM(status)) AS status
FROM current_table;`;

export const raceData = raceDataset as RaceDataset;

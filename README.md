# Data Grand Prix

Frontend-first MVP for a racing-styled SQL cleaning game built around seeded race datasets.

## Stack

- React + TypeScript + Vite
- Monaco Editor
- Supabase Edge Function for server-side SQL execution
- Python seeded dataset generator

## Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Generate or regenerate the race dataset with `python3 scripts/generate_race_dataset.py --seed 20260315 --rows 18 --output src/generated/race_seed_20260315.json`.
4. Install dependencies with `npm install`.
5. Start the app with `npm run dev`.

## MVP Flow

- Python generates a deterministic messy dataset from a seed.
- Bronze starts from that generated `raw_table` payload.
- Queries execute server-side against the current confirmed table.
- The right panel is a preview only until the user confirms it.
- Reverse and history navigation only work within the active layer.
- Qualify promotes the current confirmed table into a higher layer and locks access to lower-layer history.

## Supabase

- Edge function source: `supabase/functions/execute-query/index.ts`
- Metadata schema migrations: `supabase/migrations/*.sql`
- Dataset generator: `scripts/generate_race_dataset.py`

## Persistence Model

- Supabase stores race metadata, session state, SQL attempts, and optional final submissions.
- Raw generated rows are recreated from the stored seed and do not need permanent storage in Supabase.

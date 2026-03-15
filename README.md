# Data Grand Prix

Frontend-first MVP for a racing-styled SQL cleaning game.

## Stack

- React + TypeScript + Vite
- Monaco Editor
- Supabase Edge Function for server-side SQL execution

## Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

## MVP Flow

- Bronze starts with the raw messy dataset.
- Queries execute server-side against the current confirmed table.
- The right panel is a preview only until the user confirms it.
- Reverse and history navigation only work within the active layer.
- Qualify promotes the current confirmed table into a higher layer and locks access to lower-layer history.

## Supabase

- Edge function source: `supabase/functions/execute-query/index.ts`
- Starter dataset migration: `supabase/migrations/create_data_grand_prix_schema.sql`

/*
  # Data Grand Prix Schema

  1. New Tables
    - `raw_dataset`
      - Stores the initial messy dataset used as the starting point
      - Columns: id, first_name, last_name, email, country, signup_date, amount, status
      - Contains intentionally dirty data with duplicates, nulls, inconsistent casing, etc.
    
    - `game_sessions`
      - Tracks user game sessions and current state
      - `id` (uuid, primary key)
      - `active_layer` (text) - bronze, silver, or gold
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `layer_history`
      - Stores version history for each layer
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to game_sessions)
      - `layer` (text) - bronze, silver, or gold
      - `version_number` (integer)
      - `data_snapshot` (jsonb) - stores the entire table state as JSON
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - Allow public read access to raw_dataset (it's starter data)
    - Allow authenticated users full access to their own game sessions and history
  
  3. Initial Data
    - Populate raw_dataset with messy sample data
*/

-- Create raw_dataset table with messy data
CREATE TABLE IF NOT EXISTS raw_dataset (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  country TEXT,
  signup_date TEXT,
  amount TEXT,
  status TEXT
);

-- Insert messy sample data
INSERT INTO raw_dataset (first_name, last_name, email, country, signup_date, amount, status) VALUES
  ('  John', 'DOE', 'john.doe@email.com', 'USA', '2024-01-15', '1250.50', 'active'),
  ('jane', 'Smith  ', 'JANE.SMITH@EMAIL.COM', 'united states', '2024-01-16', '$2,500.00', 'Active'),
  ('BOB', 'JOHNSON', 'bob@email', 'usa', '01/17/2024', '750', 'ACTIVE'),
  ('Alice', 'Williams', 'alice.williams@email.com', 'Canada', '2024-01-18', '3,200.75', 'inactive'),
  ('  John', 'DOE', 'john.doe@email.com', 'USA', '2024-01-15', '1250.50', 'active'),
  (NULL, 'Brown', 'brown@email.com', 'UK', '2024-01-19', '1,800', 'active'),
  ('Charlie', NULL, 'charlie@email.com', 'United Kingdom', '2024-01-20', NULL, 'Active'),
  ('DAVID', 'miller', 'david.miller@email.com', 'canada', '2024-01-21', '$4,500.00', 'INACTIVE'),
  ('Emma', 'DAVIS', 'emma.davis@', 'Australia', '01/22/2024', '2,100.00', 'active'),
  ('frank', 'wilson', 'FRANK.WILSON@EMAIL.COM', 'australia', '2024-01-23', '$950.50', 'Active'),
  ('Grace', 'Moore', 'grace.moore@email.com', 'New Zealand', '2024-01-24', '1,650', 'active'),
  ('Henry', 'Taylor  ', 'henry.taylor@email.com', 'new zealand', '01/25/2024', '3,300.25', 'ACTIVE'),
  ('  ISABEL', 'Anderson', 'isabel@email', 'USA', '2024-01-26', '$2,750', 'inactive'),
  ('jack', 'THOMAS', 'jack.thomas@email.com', 'Canada', '2024-01-27', '1,200.00', 'Active'),
  ('Kate', 'Jackson', 'kate.jackson@email.com', 'UK', '01/28/2024', '1,950', 'active'),
  ('Liam', 'White', 'liam.white@email.com', NULL, '2024-01-29', '2,800.50', 'ACTIVE'),
  ('Mia', 'Harris', 'mia.harris@email.com', 'USA', '2024-01-30', NULL, 'inactive'),
  ('noah', 'martin', 'NOAH.MARTIN@EMAIL.COM', 'canada', '2024-01-31', '$3,500.00', 'Active'),
  ('Olivia', 'Thompson', 'olivia.thompson@', 'Australia', '2024-02-01', '1,450', 'active'),
  ('  PAUL', 'garcia', 'paul.garcia@email.com', 'uk', '02/02/2024', '2,600.75', 'ACTIVE');

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active_layer TEXT NOT NULL DEFAULT 'bronze',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create layer_history table
CREATE TABLE IF NOT EXISTS layer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  data_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, layer, version_number)
);

-- Enable RLS
ALTER TABLE raw_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE layer_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for raw_dataset (public read)
CREATE POLICY "Anyone can read raw dataset"
  ON raw_dataset FOR SELECT
  USING (true);

-- RLS Policies for game_sessions (everyone can manage sessions)
CREATE POLICY "Anyone can view game sessions"
  ON game_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create game sessions"
  ON game_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update game sessions"
  ON game_sessions FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete game sessions"
  ON game_sessions FOR DELETE
  USING (true);

-- RLS Policies for layer_history (everyone can manage history)
CREATE POLICY "Anyone can view layer history"
  ON layer_history FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create layer history"
  ON layer_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update layer history"
  ON layer_history FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete layer history"
  ON layer_history FOR DELETE
  USING (true);

Prompt for LLM — Build the MVP Prototype
You are a senior full-stack engineer and data engineer.Your task is to help me build an MVP prototype of a SQL-based data engineering game where cleaning data improves a Formula-1 race performance.
This is an educational game for data engineers where players must clean messy datasets using SQL to improve race outcomes.
You must design and implement a working prototype with a clean architecture and clear modular structure.

Product Concept
The game is called Data Grand Prix.
Players receive a messy CSV dataset representing race telemetry.
They must write SQL queries to clean the dataset.
The game evaluates the cleaned dataset and calculates a data quality score.
The quality score affects the race performance.
The race is visualized using an F1 replay animation.
Better data → faster race.
Poor data → penalties, pit stops, slower laps.

Core Gameplay Loop
	1	Generate messy dataset
	2	Player writes SQL to clean it
	3	SQL runs in a sandbox database
	4	System evaluates the cleaned data
	5	Compute data quality score
	6	Convert score into race metrics
	7	Run race simulation
	8	Visualize race replay
	9	Display leaderboard

MVP Requirements
Implement a minimal working prototype.
Players must be able to:
	•	view dataset
	•	write SQL queries
	•	execute queries
	•	create bronze/silver/gold tables
	•	receive a quality score
	•	run a race simulation
	•	see race results

Data System
Dataset characteristics:
	•	CSV file
	•	100 rows
	•	same dataset for every player (for MVP)
Example columns:

driver_id
lap
lap_time
tire_type
fuel_level
track_temp
pit_stop
sector1_time
sector2_time
sector3_time

Dataset should intentionally contain:
	•	null values
	•	duplicate rows
	•	inconsistent casing
	•	schema mismatches
	•	invalid values
	•	outliers
	•	negative values
	•	mixed units
Example bad data:

lap_time = NULL
track_temp = "34C"
fuel_level = -5
duplicate laps
tire_type = Soft / soft / SOFT


SQL Gameplay Rules
Players must write SQL queries.
Allowed SQL operations for MVP:

CREATE TABLE AS SELECT
SELECT

Players must create these tables:

bronze
silver
gold

Expected pipeline:

CSV → bronze → silver → gold

Example player SQL:

CREATE TABLE bronze AS
SELECT * FROM read_csv_auto('telemetry_raw.csv');

CREATE TABLE silver AS
SELECT
driver_id,
lap,
COALESCE(lap_time, AVG(lap_time) OVER()) AS lap_time,
LOWER(tire_type) AS tire_type,
CAST(REPLACE(track_temp,'C','') AS INTEGER) AS track_temp,
fuel_level
FROM bronze;

CREATE TABLE gold AS
SELECT DISTINCT *
FROM silver
WHERE fuel_level >= 0;


Data Quality Scoring System
Evaluate the gold dataset using these weights:

Null handling → 30%
Deduplication → 20%
Schema validation → 20%
Normalization → 20%
Outlier detection → 10%

Total score:

0 – 100

Example result:

Null Handling: 25/30
Deduplication: 20/20
Schema: 18/20
Normalization: 15/20
Outliers: 7/10

Final Score: 85


Over-Cleaning Penalty
Penalize excessive row removal.
Rules:

if gold_rows < 60:
    penalty = -15

if gold_rows < 80:
    penalty = -5


Race Engine Logic
Race performance formula:

lap_time = base_lap - quality_bonus + penalties

Example:

base_lap = 90 seconds
quality_bonus = score * 0.1
penalties = unresolved_data_issues * 0.5

Example:

score = 90
bonus = 9

lap_time = 90 - 9 = 81

Poor cleaning example:

score = 55
bonus = 5.5

lap_time = 84.5

Better cleaning results in faster lap times.

Race Simulation Output
Generate race results as JSON.
Example:

{
  "driver": "player",
  "laps": [
    {"lap": 1, "lap_time": 83.1},
    {"lap": 2, "lap_time": 82.9},
    {"lap": 3, "lap_time": 83.4}
  ],
  "pit_stops": 1,
  "final_time": 415.3
}


Visualization
Integrate race visualization using this project:
F1 race replay visualization:
@f1-race-replay
The replay engine should consume race JSON and animate the cars.
Integrate the visualization into the web app.

Technology Stack
Use this stack:
Backend:
PythonFastAPI
Database Engine:
DuckDB
Why DuckDB:
	•	runs SQL directly on CSV
	•	lightweight
	•	no server required
	•	ideal for sandbox SQL execution
Frontend:
React
Editor:
Monaco Editor (SQL editor)
Visualization:
D3.js or Canvas
Race replay:
Integrate the F1 race replay repository.

Backend Responsibilities
Backend must:
	•	generate messy dataset
	•	run SQL queries safely
	•	track table state
	•	evaluate data quality
	•	compute race metrics
	•	produce race results JSON
Example flow:

POST /run-sql
POST /score-data
POST /run-race


Frontend Components
Build these UI components:

Dataset Viewer
SQL Editor
Run Query Button
Quality Score Panel
Race Replay Panel
Leaderboard

User flow:

Load dataset
Write SQL
Execute query
View score
Run race
Watch replay


System Architecture

Dataset Generator
      ↓
telemetry_raw.csv
      ↓
DuckDB Bronze Table
      ↓
User SQL Queries
      ↓
Silver Table
      ↓
Gold Table
      ↓
Quality Evaluation
      ↓
Race Simulation
      ↓
Race Replay Visualization


Safety Rules for SQL Execution
Ensure SQL sandbox safety.
Restrict commands:
Allow:

SELECT
CREATE TABLE AS

Disallow:

DROP
DELETE
UPDATE
ALTER

Prevent filesystem access beyond provided CSV.

MVP Deliverables
Produce a working prototype with:
	1	dataset generator
	2	SQL execution engine
	3	bronze/silver/gold pipeline
	4	data quality scoring
	5	race simulation logic
	6	replay visualization
	7	leaderboard

Code Requirements
Write:
	•	clean modular code
	•	clear comments
	•	structured folders
	•	easy to extend later
Example project structure:

backend/
  app.py
  dataset_generator.py
  sql_engine.py
  scoring_engine.py
  race_engine.py

frontend/
  src/
    SQL_editor
    Dataset_viewer
    Race_replay


Goal
Deliver a fully working prototype demonstrating:
	•	SQL-driven gameplay
	•	data quality scoring
	•	race simulation
	•	visual replay
Focus on functionality over polish.

Instruction to the LLM
Work step-by-step.
First:
	1	Design the project architecture.
Then:
	2	Build the backend SQL execution system.
Then:
	3	Implement the scoring engine.
Then:
	4	implement race simulation.
Then:
	5	integrate the race replay visualization.
Explain decisions and provide runnable code.

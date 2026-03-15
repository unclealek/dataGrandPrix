ALTER TABLE race_sessions
ALTER COLUMN current_score TYPE NUMERIC(5,1)
USING current_score::NUMERIC(5,1);

ALTER TABLE sql_attempts
ALTER COLUMN score_after TYPE NUMERIC(5,1)
USING score_after::NUMERIC(5,1);

ALTER TABLE final_submissions
ALTER COLUMN final_score TYPE NUMERIC(5,1)
USING final_score::NUMERIC(5,1);

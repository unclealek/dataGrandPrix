import duckdb
import os
import pandas as pd
from dataset_generator import generate_telemetry_dataset

class SQLEngine:
    def __init__(self):
        self.con = duckdb.connect(database=':memory:') # in-memory sandboxed execution
        self.initialize_bronze()

    def initialize_bronze(self):
        # Generate raw dataset
        self.df = generate_telemetry_dataset()
        self.df.to_csv("telemetry_raw.csv", index=False)

        # Load into bronze table
        self.con.execute("CREATE TABLE bronze AS SELECT * FROM read_csv_auto('telemetry_raw.csv', header=True)")

    def reset(self):
        # Drop all tables except bronze? Or just recreate the engine wrapper
        self.con.close()
        self.con = duckdb.connect(database=':memory:')
        self.con.execute("CREATE TABLE bronze AS SELECT * FROM read_csv_auto('telemetry_raw.csv', header=True)")

    def execute_query(self, query: str):
        # Basic safety checks
        disallowed = ['DROP', 'DELETE', 'UPDATE', 'ALTER']
        upper_query = query.upper()
        for word in disallowed:
            # simple token check
            if f"{word} " in upper_query or f"{word}\n" in upper_query:
                raise ValueError(f"Disallowed command found: {word}")

        # Execute query safely
        try:
            if upper_query.strip().startswith('SELECT'):
                # For selections, return the data
                result = self.con.execute(query).df()
                # Handle NaN for JSON serialization
                result = result.fillna("None")
                return result.to_dict(orient="records")
            else:
                self.con.execute(query)
                return [{"message": "Query executed successfully."}]
        except Exception as e:
            raise ValueError(str(e))

    def get_table_data(self, table_name: str):
        try:
            result = self.con.execute(f"SELECT * FROM {table_name} LIMIT 100").df()
            result = result.fillna("None")
            return result.to_dict(orient="records")
        except Exception as e:
            return None

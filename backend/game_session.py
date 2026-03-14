from pathlib import Path

import duckdb

from dataset_generator import generate_telemetry_dataset


class GameSession:
    def __init__(self, seed: int = 7):
        self.seed = seed
        self.dataset_path = Path(__file__).with_name("telemetry_raw.csv")
        self.con = duckdb.connect(database=":memory:")
        self.reset()

    def reset(self):
        self.con.close()
        self.con = duckdb.connect(database=":memory:")
        self._load_bronze()

    def _load_bronze(self):
        df = generate_telemetry_dataset(seed=self.seed)
        df.to_csv(self.dataset_path, index=False)
        self.con.execute(
            "CREATE TABLE bronze AS SELECT * FROM read_csv_auto(?, header=true)",
            [str(self.dataset_path)],
        )

    def execute_query(self, query: str):
        normalized = query.strip()
        if not normalized:
            raise ValueError("Query cannot be empty.")

        self._validate_query(normalized)

        try:
            if normalized.upper().startswith("SELECT"):
                result = self.con.execute(normalized).df().fillna("None")
                return {"kind": "rows", "rows": result.to_dict(orient="records")}

            self.con.execute(normalized)
            return {"kind": "statement", "rows": [], "message": "Query executed successfully."}
        except Exception as exc:
            raise ValueError(str(exc)) from exc

    def _validate_query(self, query: str):
        upper_query = query.upper()
        allowed_starts = ("SELECT", "CREATE TABLE", "CREATE OR REPLACE TABLE")
        if not upper_query.startswith(allowed_starts):
            raise ValueError("Only SELECT and CREATE TABLE ... AS SELECT statements are allowed.")

        blocked_tokens = [
            "DROP ",
            "DELETE ",
            "UPDATE ",
            "ALTER ",
            "INSERT ",
            "TRUNCATE ",
            "COPY ",
            "ATTACH ",
            "DETACH ",
        ]
        for token in blocked_tokens:
            if token in upper_query:
                raise ValueError(f"Disallowed command found: {token.strip()}")

    def get_table_data(self, table_name: str, limit: int = 100):
        if not table_name.replace("_", "").isalnum():
            return None

        try:
            result = self.con.execute(f"SELECT * FROM {table_name} LIMIT {limit}").df().fillna("None")
            return result.to_dict(orient="records")
        except Exception:
            return None

    def table_exists(self, table_name: str) -> bool:
        if not table_name.replace("_", "").isalnum():
            return False

        query = """
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_name = ?
        """
        return self.con.execute(query, [table_name]).fetchone()[0] > 0

    def get_dataframe(self, table_name: str):
        if not self.table_exists(table_name):
            return None
        return self.con.execute(f"SELECT * FROM {table_name}").df()

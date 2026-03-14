from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from game_session import GameSession
from scoring_engine import score_data
from race_engine import run_race_simulation

app = FastAPI(title="Data Grand Prix API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global session for the MVP sandbox
game_session = GameSession()


class SQLRequest(BaseModel):
    query: str

@app.get("/dataset")
async def get_dataset(table: str = 'bronze'):
    data = game_session.get_table_data(table)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Table {table} not found.")
    return {"table": table, "data": data, "row_count": len(data)}

@app.post("/run-sql")
async def run_sql(req: SQLRequest):
    try:
        result = game_session.execute_query(req.query)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/score-data")
async def get_score():
    try:
        df_bronze = game_session.get_dataframe("bronze")
        df_gold = game_session.get_dataframe("gold")
        if df_gold is None:
            raise HTTPException(status_code=400, detail="Gold table not found. Please create it first.")
        result = score_data(df_bronze, df_gold)
        return {"status": "success", "scorecard": result}
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/run-race")
async def run_race():
    try:
        df_bronze = game_session.get_dataframe("bronze")
        df_gold = game_session.get_dataframe("gold")
        if df_gold is None:
            raise HTTPException(status_code=400, detail="Gold table not found. Please create it first.")
        scorecard = score_data(df_bronze, df_gold)
        result = run_race_simulation(scorecard)
        return {"status": "success", "scorecard": scorecard, "race_results": result}
    except HTTPException as h:
        raise h
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reset")
async def reset_game():
    global game_session
    game_session.reset()
    return {"status": "success", "message": "Database reset to initial bronze state."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

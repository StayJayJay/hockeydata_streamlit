from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
import models
from routers import games, teams, predictions

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Hockey Analytics API",
    description="Databáze a predikce zápasů České extraligy",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(games.router)
app.include_router(teams.router)
app.include_router(predictions.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Hockey Analytics API"}


@app.get("/seasons")
def list_seasons(db=None):
    from database import SessionLocal
    from models import Season
    db = SessionLocal()
    seasons = db.query(Season).all()
    db.close()
    return [{"id": s.id, "code": s.code, "league": s.league} for s in seasons]
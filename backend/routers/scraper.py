from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from services.scheduler import scheduler
from services.scraper import scrape_standings, run_scrape

router = APIRouter(prefix="/scraper", tags=["scraper"])


class ScrapeRequest(BaseModel):
    season: str = "2025-2026"
    full: bool = False      # True = stáhne i detaily zápasů (střely)
    dry_run: bool = False
    max_games: int = 0      # 0 = vše


@router.get("/status")
def get_status():
    """Vrátí stav scheduleru a poslední scrape."""
    return scheduler.status()


@router.post("/run")
def run_scraper(payload: ScrapeRequest):
    """
    Spustí scraper ručně.
    dry_run=True → jen vypíše data, neuloží.
    full=True → stáhne i detailní stránky zápasů (střely, góly).
    """
    if payload.dry_run:
        # Synchronní pro dry-run (chceme hned vidět výsledek)
        games, standings = run_scrape(
            season=payload.season,
            dry_run=True,
            max_games=payload.max_games or 10,
            with_details=payload.full,
        )
        return {
            "dry_run": True,
            "games_found": len(games),
            "sample": games[:5],
            "standings_top5": standings[:5],
        }

    # Asynchronní pro reálný run
    return scheduler.run_now(full=payload.full)


@router.get("/standings/{season}")
def get_standings(season: str = "2025-2026"):
    """Načte aktuální tabulku přímo z hokejportal.cz."""
    standings = scrape_standings(season)
    if not standings:
        raise HTTPException(status_code=503, detail="Nepodařilo se načíst tabulku z hokejportal.cz")
    return standings


@router.post("/start-scheduler")
def start_scheduler():
    """Spustí automatický denní scheduler."""
    scheduler.start()
    return {"message": "Scheduler spuštěn (denní scrape v 01:00, týdenní v neděli 02:00)"}


@router.post("/stop-scheduler")
def stop_scheduler():
    """Zastaví scheduler."""
    scheduler.stop()
    return {"message": "Scheduler zastaven"}
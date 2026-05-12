from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
import models

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreate(BaseModel):
    code: str
    name: Optional[str] = None
    city: Optional[str] = None
    league: str = "ELH"
    since: Optional[int] = None


@router.get("/")
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(models.Team).order_by(models.Team.code).all()
    return [{"id": t.id, "code": t.code, "name": t.name, "city": t.city, "league": t.league} for t in teams]


@router.get("/{code}")
def get_team(code: str, db: Session = Depends(get_db)):
    t = db.query(models.Team).filter_by(code=code.upper()).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tým nenalezen")
    goalies = [{"id": g.id, "name": g.name} for g in t.goalies]
    return {"id": t.id, "code": t.code, "name": t.name, "city": t.city, "league": t.league, "goalies": goalies}


@router.post("/", status_code=201)
def create_team(payload: TeamCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Team).filter_by(code=payload.code.upper()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tým již existuje")
    team = models.Team(**payload.model_dump())
    team.code = team.code.upper()
    db.add(team)
    db.commit()
    return {"id": team.id, "code": team.code}


@router.get("/{code}/goalies")
def list_goalies(code: str, db: Session = Depends(get_db)):
    t = db.query(models.Team).filter_by(code=code.upper()).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tým nenalezen")
    return [{"id": g.id, "name": g.name} for g in t.goalies]
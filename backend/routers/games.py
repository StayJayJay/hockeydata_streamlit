from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from database import get_db
import models

router = APIRouter(prefix="/games", tags=["games"])


class GameCreate(BaseModel):
    season_code: str
    home_team_code: str
    away_team_code: str
    date: date
    round: Optional[int] = None
    game_type: str = "RS"
    goals_home: Optional[int] = None
    goals_away: Optional[int] = None
    shots_home: Optional[int] = None
    shots_away: Optional[int] = None
    xg_home: Optional[float] = None
    xg_away: Optional[float] = None
    ot_so: int = 0
    # PP/PK
    home_pp_o: Optional[int] = None
    home_pp_g: Optional[int] = None
    home_pk_o: Optional[int] = None
    home_pk_ga: Optional[int] = None
    away_pp_o: Optional[int] = None
    away_pp_g: Optional[int] = None
    away_pk_o: Optional[int] = None
    away_pk_ga: Optional[int] = None
    # Brankáři
    home_goalie: Optional[str] = None
    home_goalie_shots: Optional[int] = None
    home_goalie_saves: Optional[int] = None
    home_goalie_ga: Optional[int] = None
    away_goalie: Optional[str] = None
    away_goalie_shots: Optional[int] = None
    away_goalie_saves: Optional[int] = None
    away_goalie_ga: Optional[int] = None


def _game_to_dict(g: models.Game) -> dict:
    return {
        "id": g.id,
        "date": str(g.date),
        "round": g.round,
        "game_type": g.game_type,
        "home_team": g.home_team.code if g.home_team else None,
        "away_team": g.away_team.code if g.away_team else None,
        "goals_home": g.goals_home,
        "goals_away": g.goals_away,
        "shots_home": g.shots_home,
        "shots_away": g.shots_away,
        "xg_home": g.xg_home,
        "xg_away": g.xg_away,
        "ot_so": g.ot_so,
        "result_home": g.result_home,
    }


@router.get("/")
def list_games(
    season: Optional[str] = None,
    team: Optional[str] = None,
    game_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = db.query(models.Game)
    if season:
        s = db.query(models.Season).filter_by(code=season).first()
        if s:
            q = q.filter(models.Game.season_id == s.id)
    if team:
        t = db.query(models.Team).filter_by(code=team).first()
        if t:
            q = q.filter(
                (models.Game.home_team_id == t.id) | (models.Game.away_team_id == t.id)
            )
    if game_type:
        q = q.filter(models.Game.game_type == game_type)

    total = q.count()
    games = q.order_by(models.Game.date.desc()).offset(offset).limit(limit).all()
    return {"total": total, "games": [_game_to_dict(g) for g in games]}


@router.get("/{game_id}")
def get_game(game_id: int, db: Session = Depends(get_db)):
    g = db.query(models.Game).filter_by(id=game_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Zápas nenalezen")
    data = _game_to_dict(g)
    data["pp_pk"] = [
        {
            "team": pp.team.code,
            "pp_o": pp.pp_opportunities,
            "pp_g": pp.pp_goals,
            "pk_o": pp.pk_opportunities,
            "pk_ga": pp.pk_goals_against,
        }
        for pp in g.pp_pk_stats
    ]
    data["goalies"] = [
        {
            "goalie": gs.goalie.name,
            "shots_against": gs.shots_against,
            "saves": gs.saves,
            "goals_against": gs.goals_against,
        }
        for gs in g.goalie_stats
    ]
    return data


@router.post("/", status_code=201)
def create_game(payload: GameCreate, db: Session = Depends(get_db)):
    season = db.query(models.Season).filter_by(code=payload.season_code).first()
    if not season:
        raise HTTPException(status_code=404, detail=f"Sezóna {payload.season_code} nenalezena")

    home_team = db.query(models.Team).filter_by(code=payload.home_team_code).first()
    away_team = db.query(models.Team).filter_by(code=payload.away_team_code).first()
    if not home_team or not away_team:
        raise HTTPException(status_code=404, detail="Tým nenalezen")

    existing = db.query(models.Game).filter_by(
        date=payload.date,
        home_team_id=home_team.id,
        away_team_id=away_team.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Zápas již existuje")

    # Výsledek domácích
    result_home = None
    if payload.goals_home is not None and payload.goals_away is not None:
        if payload.goals_home > payload.goals_away:
            result_home = "OTW" if payload.ot_so else "W"
        else:
            result_home = "OTL" if payload.ot_so else "L"

    game = models.Game(
        season_id=season.id,
        home_team_id=home_team.id,
        away_team_id=away_team.id,
        date=payload.date,
        round=payload.round,
        game_type=payload.game_type,
        goals_home=payload.goals_home,
        goals_away=payload.goals_away,
        shots_home=payload.shots_home,
        shots_away=payload.shots_away,
        xg_home=payload.xg_home,
        xg_away=payload.xg_away,
        ot_so=payload.ot_so,
        result_home=result_home,
    )
    db.add(game)
    db.flush()

    # PP/PK
    for team, pp_o, pp_g, pk_o, pk_ga in [
        (home_team, payload.home_pp_o, payload.home_pp_g, payload.home_pk_o, payload.home_pk_ga),
        (away_team, payload.away_pp_o, payload.away_pp_g, payload.away_pk_o, payload.away_pk_ga),
    ]:
        if any(v is not None for v in [pp_o, pp_g, pk_o, pk_ga]):
            db.add(models.GamePPPK(
                game_id=game.id,
                team_id=team.id,
                pp_opportunities=pp_o or 0,
                pp_goals=pp_g or 0,
                pk_opportunities=pk_o or 0,
                pk_goals_against=pk_ga or 0,
            ))

    # Brankáři
    for goalie_name, team, shots, saves, ga in [
        (payload.home_goalie, home_team, payload.home_goalie_shots, payload.home_goalie_saves, payload.home_goalie_ga),
        (payload.away_goalie, away_team, payload.away_goalie_shots, payload.away_goalie_saves, payload.away_goalie_ga),
    ]:
        if goalie_name:
            goalie = db.query(models.Goalie).filter_by(name=goalie_name).first()
            if not goalie:
                goalie = models.Goalie(name=goalie_name, team_id=team.id)
                db.add(goalie)
                db.flush()
            db.add(models.GoalieGameStat(
                game_id=game.id,
                goalie_id=goalie.id,
                shots_against=shots,
                saves=saves,
                goals_against=ga,
            ))

    db.commit()
    return {"id": game.id, "message": "Zápas úspěšně přidán"}


@router.delete("/{game_id}", status_code=204)
def delete_game(game_id: int, db: Session = Depends(get_db)):
    g = db.query(models.Game).filter_by(id=game_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Zápas nenalezen")
    db.delete(g)
    db.commit()
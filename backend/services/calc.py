"""
Počítá odvozené statistiky z RAW dat.
Všechny funkce pracují přímo s DB, nevyžadují pandas.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from typing import Optional
import models


def calc_team_season_stats(db: Session, season_code: str, team_code: str, game_type: str = "RS") -> dict:
    """Průměrné statistiky týmu za sezónu."""
    season = db.query(models.Season).filter_by(code=season_code).first()
    team = db.query(models.Team).filter_by(code=team_code).first()
    if not season or not team:
        return {}

    games = db.query(models.Game).filter(
        models.Game.season_id == season.id,
        models.Game.game_type == game_type,
        (models.Game.home_team_id == team.id) | (models.Game.away_team_id == team.id),
        models.Game.goals_home.isnot(None),
    ).all()

    if not games:
        return {"team": team_code, "games": 0}

    xg_diffs, shot_diffs, goal_diffs, pp_rates, pk_rates, pp_opps = [], [], [], [], [], []
    wins = 0

    for g in games:
        is_home = g.home_team_id == team.id
        gf = g.goals_home if is_home else g.goals_away
        ga = g.goals_away if is_home else g.goals_home
        sf = g.shots_home if is_home else g.shots_away
        sa = g.shots_away if is_home else g.shots_home
        xgf = g.xg_home if is_home else g.xg_away
        xga = g.xg_away if is_home else g.xg_home

        if gf is not None and ga is not None:
            goal_diffs.append(gf - ga)
            if gf > ga:
                wins += 1
        if sf is not None and sa is not None:
            shot_diffs.append(sf - sa)
        if xgf is not None and xga is not None:
            xg_diffs.append(xgf - xga)

        # PP/PK stats
        pp_row = db.query(models.GamePPPK).filter_by(game_id=g.id, team_id=team.id).first()
        if pp_row:
            if pp_row.pp_opportunities > 0:
                pp_rates.append(pp_row.pp_goals / pp_row.pp_opportunities)
                pp_opps.append(pp_row.pp_opportunities)
            if pp_row.pk_opportunities > 0:
                pk_rates.append(1 - pp_row.pk_goals_against / pp_row.pk_opportunities)

    def avg(lst): return round(sum(lst) / len(lst), 4) if lst else None

    return {
        "team": team_code,
        "season": season_code,
        "game_type": game_type,
        "games": len(games),
        "wins": wins,
        "win_pct": round(wins / len(games), 4) if games else None,
        "avg_xg_diff": avg(xg_diffs),
        "avg_shots_diff": avg(shot_diffs),
        "avg_goals_diff": avg(goal_diffs),
        "avg_pp_rate": avg(pp_rates),
        "avg_pk_rate": avg(pk_rates),
        "avg_pp_opp": avg(pp_opps),
    }


def calc_goalie_stats(db: Session, season_code: str, goalie_name: str, game_type: str = "RS") -> dict:
    """SV%, GSAA, rating brankáře."""
    season = db.query(models.Season).filter_by(code=season_code).first()
    goalie = db.query(models.Goalie).filter_by(name=goalie_name).first()
    if not season or not goalie:
        return {}

    stats = db.query(models.GoalieGameStat).join(models.Game).filter(
        models.Game.season_id == season.id,
        models.Game.game_type == game_type,
        models.GoalieGameStat.goalie_id == goalie.id,
        models.GoalieGameStat.shots_against.isnot(None),
    ).order_by(models.Game.date).all()

    if not stats:
        return {"goalie": goalie_name, "games": 0}

    total_shots = sum(s.shots_against for s in stats)
    total_saves = sum(s.saves for s in stats if s.saves is not None)
    total_ga = sum(s.goals_against for s in stats if s.goals_against is not None)

    sv_pct = round(total_saves / total_shots, 4) if total_shots > 0 else None
    league_sv = total_saves/total_shots  # průměr ligy

    # GSAA = Saves - (Shots * liga_prumer)
    gsaa = round(total_saves - total_shots * league_sv, 3) if total_shots > 0 else None

    # Forma — posledních 5 zápasů
    last5 = stats[-5:]
    shots_l5 = sum(s.shots_against for s in last5)
    saves_l5 = sum(s.saves for s in last5 if s.saves is not None)
    sv_last5 = round(saves_l5 / shots_l5, 4) if shots_l5 > 0 else None

    # Goalie rating = GSAA / zápasy (normalizovaný)
    games_count = len(stats)
    gsaa_per_game = round(gsaa / games_count, 4) if gsaa and games_count > 0 else None

    return {
        "goalie": goalie_name,
        "season": season_code,
        "game_type": game_type,
        "games": games_count,
        "shots_against": total_shots,
        "goals_against": total_ga,
        "sv_pct": sv_pct,
        "sv_last5": sv_last5,
        "gsaa": gsaa,
        "gsaa_per_game": gsaa_per_game,
        "goalie_rating": gsaa_per_game,
    }


def calc_team_form(db: Session, team_code: str, season_code: str, last_n: int = 5) -> dict:
    """forma týmu za posledních N zápasů."""
    season = db.query(models.Season).filter_by(code=season_code).first()
    team = db.query(models.Team).filter_by(code=team_code).first()
    if not season or not team:
        return {}

    games = db.query(models.Game).filter(
        models.Game.season_id == season.id,
        (models.Game.home_team_id == team.id) | (models.Game.away_team_id == team.id),
        models.Game.goals_home.isnot(None),
    ).order_by(models.Game.date.desc()).limit(last_n).all()

    results = []
    points = 0
    for g in games:
        is_home = g.home_team_id == team.id
        gf = g.goals_home if is_home else g.goals_away
        ga = g.goals_away if is_home else g.goals_home
        if gf > ga:
            results.append("W")
            points += 3
        elif g.ot_so and gf < ga:
            results.append("OTL")
            points += 1
        else:
            results.append("L")

    return {
        "team": team_code,
        "last_n": last_n,
        "results": results[::-1],  # chronologicky
        "points": points,
        "form_pct": round(points / (last_n * 3), 4) if last_n > 0 else None,
    }


def calc_match_prediction_input(
    db: Session,
    home_team_code: str,
    away_team_code: str,
    season_code: str,
    home_goalie_name: Optional[str] = None,
    away_goalie_name: Optional[str] = None,
    game_type: str = "RS",
) -> dict:
    """
    Připraví vstupy pro predikci
    Vrací hodnoty připravené pro logistický model.
    """
    home_stats = calc_team_season_stats(db, season_code, home_team_code, game_type)
    away_stats = calc_team_season_stats(db, season_code, away_team_code, game_type)

    xg_diff = None
    if home_stats.get("avg_xg_diff") is not None and away_stats.get("avg_xg_diff") is not None:
        xg_diff = round(home_stats["avg_xg_diff"] - away_stats["avg_xg_diff"], 4)

    shot_diff = None
    if home_stats.get("avg_shots_diff") is not None and away_stats.get("avg_shots_diff") is not None:
        shot_diff = round(home_stats["avg_shots_diff"] - away_stats["avg_shots_diff"], 4)

    pp_diff = None
    if home_stats.get("avg_pp_rate") is not None and away_stats.get("avg_pp_rate") is not None:
        pp_diff = round(home_stats["avg_pp_rate"] - away_stats["avg_pp_rate"], 4)

    home_goalie_rating = None
    away_goalie_rating = None
    if home_goalie_name:
        g = calc_goalie_stats(db, season_code, home_goalie_name, game_type)
        home_goalie_rating = g.get("goalie_rating")
    if away_goalie_name:
        g = calc_goalie_stats(db, season_code, away_goalie_name, game_type)
        away_goalie_rating = g.get("goalie_rating")

    goalie_rating_diff = None
    if home_goalie_rating is not None and away_goalie_rating is not None:
        goalie_rating_diff = round(home_goalie_rating - away_goalie_rating, 4)

    return {
        "home_team": home_team_code,
        "away_team": away_team_code,
        "season": season_code,
        "game_type": game_type,
        "home": 1,
        "xg_diff": xg_diff,
        "shots_diff": shot_diff,
        "pp_diff": pp_diff,
        "goalie_rating_diff": goalie_rating_diff,
        "home_goalie": home_goalie_name,
        "away_goalie": away_goalie_name,
        "home_stats": home_stats,
        "away_stats": away_stats,
    }
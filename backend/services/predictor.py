"""
Predikční model — logistická regrese s parametry z Minitab uloženými v DB.
Replika PREDIKCE_ZAPASU listu.
"""
import math
from sqlalchemy.orm import Session
from typing import Optional
import models
from services.calc import calc_match_prediction_input


def load_params(db: Session, season_code: str, game_type: str = "RS") -> dict:
    """Načte Minitab parametry z DB pro danou sezónu a typ zápasu."""
    rows = db.query(models.ModelParameter).filter_by(
        season_code=season_code,
        game_type=game_type,
    ).all()

    if not rows:
        # Fallback na RS parametry pokud PO chybí
        rows = db.query(models.ModelParameter).filter_by(
            season_code=season_code,
            game_type="RS",
        ).all()

    return {r.parameter: r.coefficient for r in rows}


def logistic(x: float) -> float:
    """Sigmoid funkce — převod linear score na pravděpodobnost."""
    try:
        return 1 / (1 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0


def predict_match(
    db: Session,
    home_team_code: str,
    away_team_code: str,
    season_code: str,
    home_goalie_name: Optional[str] = None,
    away_goalie_name: Optional[str] = None,
    game_type: str = "RS",
) -> dict:
    """
    Vypočte pravděpodobnost výhry domácího týmu.
    Model: Linear_Score = Intercept + Home*1 + xG_Diff*coef + PP_Diff*coef + Goalie*coef
    P_Win = sigmoid(Linear_Score)
    """
    params = load_params(db, season_code, game_type)
    if not params:
        return {"error": f"Parametry pro {season_code} / {game_type} nenalezeny v DB"}

    inputs = calc_match_prediction_input(
        db=db,
        home_team_code=home_team_code,
        away_team_code=away_team_code,
        season_code=season_code,
        home_goalie_name=home_goalie_name,
        away_goalie_name=away_goalie_name,
        game_type=game_type,
    )

    # Škálovací faktory (z listu PARAMETRY)
    scale_pp = params.get("Scale_PP", 0.15)
    scale_xg = params.get("Scale_xG", 1.0)
    scale_shots = params.get("Scale_Shots", 0.05)

    # Výpočet linear score — přesně jako v PREDIKCE_ZAPASU
    intercept = params.get("Intercept", 0)
    home_bonus = params.get("Home", 0)

    xg_term = 0
    if inputs.get("xg_diff") is not None:
        xg_term = inputs["xg_diff"] * scale_xg * params.get("xG_Diff", 0)

    shots_term = 0
    if inputs.get("shots_diff") is not None and inputs.get("xg_diff") is None:
        shots_term = inputs["shots_diff"] * scale_shots * params.get("xG_Diff", 0)

    quality_diff = inputs["xg_diff"] if inputs.get("xg_diff") is not None else (
        (inputs.get("shots_diff") or 0) * scale_shots
    )

    pp_term = 0
    if inputs.get("pp_diff") is not None:
        pp_term = inputs["pp_diff"] * scale_pp * params.get("PP_Diff", 0)

    goalie_term = 0
    if inputs.get("goalie_rating_diff") is not None:
        goalie_term = inputs["goalie_rating_diff"] * params.get("Goalie", 0)

    team_strength_term = 0  # baseline, rozšíříme later

    linear_score = (
        intercept
        + home_bonus
        + quality_diff * params.get("xG_Diff", 0)
        + pp_term
        + goalie_term
        + team_strength_term
    )

    p_home_win = logistic(linear_score)
    p_away_win = 1 - p_home_win

    return {
        "home_team": home_team_code,
        "away_team": away_team_code,
        "season": season_code,
        "game_type": game_type,
        "linear_score": round(linear_score, 6),
        "p_home_win": round(p_home_win, 4),
        "p_away_win": round(p_away_win, 4),
        "model_inputs": {
            "intercept": intercept,
            "home_bonus": home_bonus,
            "xg_diff": inputs.get("xg_diff"),
            "pp_diff": inputs.get("pp_diff"),
            "goalie_rating_diff": inputs.get("goalie_rating_diff"),
            "quality_diff": quality_diff,
        },
        "params_used": params,
        "team_stats": {
            "home": inputs.get("home_stats"),
            "away": inputs.get("away_stats"),
        },
    }
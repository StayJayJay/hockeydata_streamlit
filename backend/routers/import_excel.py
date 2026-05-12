"""
Import dat z Excel souboru HOCKEY_LOGIC_PREDICTIONS.xlsx do SQLite databáze.
Spuštění: python import_excel.py <cesta_k_excel>
"""
import sys
import os
import pandas as pd
from datetime import date
import re
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)


def get_or_create(db, model, defaults=None, **kwargs):
    instance = db.query(model).filter_by(**kwargs).first()
    if instance:
        return instance, False
    params = {**kwargs, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True

def parse_round(val):
    """Vrátí int pro '12' nebo vytáhne číslo z 'Čtvrť-G1'. Jinak None."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    # čistě číslo
    if s.isdigit():
        return int(s)
    # playoff formát: něco jako "...-G1" / "G1"
    m = re.search(r'G\s*(\d+)', s, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    # fallback: zkus poslední číslo v řetězci (kdyby bylo "Round 3")
    m2 = re.search(r'(\d+)\s*$', s)
    if m2:
        return int(m2.group(1))
    return None

def import_excel(filepath: str):
    db = SessionLocal()
    xl = pd.ExcelFile(filepath)

    print("=== 1/5 Načítám týmy ===")
    df_games_raw = pd.read_excel(filepath, sheet_name="RAW_GAMES")

    # Vytvoř sezónu
    season_code = str(df_games_raw["Season"].iloc[0])
    season, _ = get_or_create(db, models.Season,
        defaults={"league": "ELH", "games_rs": 52},
        code=season_code,
    )
    db.flush()
    print(f"  Sezóna: {season_code}")

    # Vytvoř týmy ze sloupců Team + Opponent
    all_team_codes = set(df_games_raw["Team"].unique()) | set(df_games_raw["Opponent"].unique())
    team_map = {}
    for code in sorted(all_team_codes):
        team, created = get_or_create(db, models.Team,
            defaults={"name": code, "league": "ELH"},
            code=code,
        )
        team_map[code] = team
        if created:
            print(f"  Tým: {code}")
    db.flush()

    print(f"\n=== 2/5 Importuji brankáře ===")
    df_goalies_raw = pd.read_excel(filepath, sheet_name="RAW_GOALIES_GAMES")
    goalie_map = {}
    for _, row in df_goalies_raw.iterrows():
        goalie_name = str(row["Goalie"]).strip()
        team_code = str(row["Team"]).strip()
        if goalie_name == "nan" or team_code not in team_map:
            continue
        key = (goalie_name, team_code)
        if key not in goalie_map:
            goalie, created = get_or_create(db, models.Goalie,
                defaults={"team_id": team_map[team_code].id},
                name=goalie_name,
            )
            goalie_map[key] = goalie
            if created:
                print(f"  Brankář: {goalie_name} ({team_code})")
    db.flush()

    print(f"\n=== 3/5 Importuji zápasy ({len(df_games_raw)} záznamů) ===")
    # RAW_GAMES má jeden řádek na tým — párujeme domácí+hostující
    home_rows = df_games_raw[df_games_raw["Home"] == 1].copy()
    away_rows = df_games_raw[df_games_raw["Home"] == 0].copy()

    # Klíč pro párování: datum + domácí tým (Team kde Home=1) + soupeř
    home_rows["match_key"] = home_rows["Date"].astype(str) + "|" + home_rows["Team"] + "|" + home_rows["Opponent"]
    away_rows["match_key"] = away_rows["Date"].astype(str) + "|" + away_rows["Opponent"] + "|" + away_rows["Team"]

    away_dict = away_rows.set_index("match_key").to_dict("index")

    game_map = {}
    skipped = 0
    for _, home_row in home_rows.iterrows():
        key = home_row["match_key"]
        away_row = away_dict.get(key)

        home_code = str(home_row["Team"])
        away_code = str(home_row["Opponent"])

        if home_code not in team_map or away_code not in team_map:
            skipped += 1
            continue

        game_date = pd.to_datetime(home_row["Date"]).date()
        ot_so_val = int(home_row["OT_SO"]) if pd.notna(home_row["OT_SO"]) else 0
        result_raw = str(home_row["Result"]).strip() if pd.notna(home_row["Result"]) else "?"
        game_type = str(home_row["Game_Type"]).strip() if pd.notna(home_row.get("Game_Type", "RS")) else "RS"

        game, created = get_or_create(db, models.Game,
            defaults={
                "season_id": season.id,
                "round": parse_round(home_row.get("Kolo/Zapas")),
                "game_type": game_type,
                "goals_home": int(home_row["Goals_For"]) if pd.notna(home_row["Goals_For"]) else None,
                "goals_away": int(home_row["Goals_Against"]) if pd.notna(home_row["Goals_Against"]) else None,
                "shots_home": int(home_row["Shots_For"]) if pd.notna(home_row["Shots_For"]) else None,
                "shots_away": int(home_row["Shots_Against"]) if pd.notna(home_row["Shots_Against"]) else None,
                "xg_home": float(home_row["xG_For"]) if pd.notna(home_row.get("xG_For")) else None,
                "xg_away": float(home_row["xG_Against"]) if pd.notna(home_row.get("xG_Against")) else None,
                "ot_so": ot_so_val,
                "result_home": result_raw,
            },
            date=game_date,
            home_team_id=team_map[home_code].id,
            away_team_id=team_map[away_code].id,
        )
        game_map[key] = game

    db.flush()
    print(f"  Importováno: {len(game_map)} zápasů, přeskočeno: {skipped}")

    print(f"\n=== 4/5 Importuji PP/PK statistiky ===")
    df_pp = pd.read_excel(filepath, sheet_name="RAW_PP_PK")
    pp_count = 0
    for _, row in df_pp.iterrows():
        team_code = str(row["Team"]).strip()
        row_date = pd.to_datetime(row["Date"]).date()
        if team_code not in team_map:
            continue
        team = team_map[team_code]
        # Najdi odpovídající zápas (domácí nebo hostující)
        game = db.query(models.Game).filter(
            models.Game.date == row_date,
            (models.Game.home_team_id == team.id) | (models.Game.away_team_id == team.id)
        ).first()
        if not game:
            continue
        existing = db.query(models.GamePPPK).filter_by(game_id=game.id, team_id=team.id).first()
        if not existing:
            pp = models.GamePPPK(
                game_id=game.id,
                team_id=team.id,
                pp_opportunities=int(row["PP_O"]) if pd.notna(row["PP_O"]) else 0,
                pp_goals=int(row["PP_G"]) if pd.notna(row["PP_G"]) else 0,
                pk_opportunities=int(row["PK_O"]) if pd.notna(row["PK_O"]) else 0,
                pk_goals_against=int(row["PK_GA"]) if pd.notna(row["PK_GA"]) else 0,
            )
            db.add(pp)
            pp_count += 1
    db.flush()
    print(f"  Importováno: {pp_count} PP/PK záznamů")

    print(f"\n=== 5/5 Importuji Minitab parametry ===")
    df_params = pd.read_excel(filepath, sheet_name="PARAMETRY")

    current_game_type = "RS"
    param_count = 0
    for _, row in df_params.iterrows():
        param_name = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
        coef_raw = row.iloc[1] if len(row) > 1 else None

        if param_name == "Play-off":
            current_game_type = "PO"
            continue
        if param_name in ("Parameter", "Regular Season", "nan", ""):
            continue
        if not pd.notna(coef_raw):
            continue
        try:
            coef = float(coef_raw)
        except (ValueError, TypeError):
            continue

        source = str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else ""
        note = str(row.iloc[3]).strip() if pd.notna(row.iloc[3]) else ""

        existing = db.query(models.ModelParameter).filter_by(
            season_code=season_code, game_type=current_game_type, parameter=param_name
        ).first()
        if not existing:
            db.add(models.ModelParameter(
                season_code=season_code,
                game_type=current_game_type,
                parameter=param_name,
                coefficient=coef,
                source=source,
                note=note,
            ))
            param_count += 1

    db.commit()
    print(f"  Importováno: {param_count} parametrů")
    print(f"\n✅ Import dokončen!")

    # Shrnutí
    print(f"\n--- Shrnutí databáze ---")
    print(f"  Sezóny:     {db.query(models.Season).count()}")
    print(f"  Týmy:       {db.query(models.Team).count()}")
    print(f"  Zápasy:     {db.query(models.Game).count()}")
    print(f"  Brankáři:   {db.query(models.Goalie).count()}")
    print(f"  PP/PK:      {db.query(models.GamePPPK).count()}")
    print(f"  Parametry:  {db.query(models.ModelParameter).count()}")

    db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Použití: python import_excel.py <cesta_k_excel>")
        sys.exit(1)
    import_excel(sys.argv[1])
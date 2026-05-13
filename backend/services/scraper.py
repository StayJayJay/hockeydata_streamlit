"""
Scraper výsledků extraligy z hokejportal.cz
Zdroj: https://www.hokejportal.cz/cesko/extraliga/vysledky/

Funkce:
  - scrape_results_page()   → seznam zápasů z přehledu výsledků
  - scrape_game_detail()    → detail zápasu (skóre po třetinách, střely, góly)
  - scrape_standings()      → tabulka sezóny
  - run_scrape()            → celý pipeline do DB

Spuštění:
  python scraper.py [--season 2025-2026] [--dry-run]
"""

import re
import sys
import time
import argparse
import logging
from datetime import datetime, date
from typing import Optional
import requests
from bs4 import BeautifulSoup

# Nastavení logování
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scraper")

BASE_URL = "https://www.hokejportal.cz"
RESULTS_URL = f"{BASE_URL}/cesko/extraliga/vysledky/"
STANDINGS_URL = f"{BASE_URL}/cesko/extraliga/tabulka/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": BASE_URL,
}

# Mapování názvů týmů na kódy v naší DB
TEAM_NAME_TO_CODE = {
    "pardubice": "PCE",
    "sparta praha": "SPA",
    "třinec": "TRI",
    "liberec": "LIB",
    "hradec králové": "HKR",
    "plzeň": "PLZ",
    "karlovy vary": "KVA",
    "kometa brno": "KOM",
    "české budějovice": "CBU",
    "kladno": "KLA",
    "vítkovice": "VIT",
    "olomouc": "OLO",
    "mladá boleslav": "MBL",
    "litvínov": "LIT",
    "jihlava": "JIH",
}


def get_page(url: str, retries: int = 3, delay: float = 1.5) -> Optional[BeautifulSoup]:
    """Stáhne stránku a vrátí BeautifulSoup objekt. Respektuje rate limit."""
    for attempt in range(retries):
        try:
            time.sleep(delay)  # slušné čekání mezi požadavky
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            return BeautifulSoup(resp.text, "html.parser")
        except requests.RequestException as e:
            log.warning(f"  Pokus {attempt+1}/{retries} selhal: {e}")
            if attempt < retries - 1:
                time.sleep(3)
    log.error(f"  Nepodařilo se načíst: {url}")
    return None


def normalize_team_name(raw: str) -> str:
    """Normalizuje název týmu na kód."""
    clean = raw.strip().lower()
    return TEAM_NAME_TO_CODE.get(clean, raw.strip().upper()[:4])


def parse_score(score_str: str) -> tuple[Optional[int], Optional[int], int]:
    """
    Parsuje skóre jako '3:2', '1:2pp', '4:3sn'.
    Vrací (goals_home, goals_away, ot_so).
    ot_so: 0=regular, 1=OT, 2=SO
    """
    s = score_str.strip().lower()
    ot_so = 0
    if s.endswith("sn"):
        ot_so = 2
        s = s[:-2]
    elif s.endswith("pp"):
        ot_so = 1
        s = s[:-2]

    parts = s.split(":")
    if len(parts) == 2:
        try:
            return int(parts[0]), int(parts[1]), ot_so
        except ValueError:
            pass
    return None, None, ot_so


def parse_date_cz(date_str: str) -> Optional[date]:
    """Parsuje datum ve formátu '19.03.2026' nebo '19.03.26'."""
    date_str = date_str.strip()
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def scrape_results_page(season: str = "2025-2026") -> list[dict]:
    """
    Scrapuje přehledovou stránku výsledků.
    Vrací seznam dicts: {date, home_team, away_team, goals_home, goals_away, ot_so, detail_url}
    """
    url = f"{RESULTS_URL}?season={season}"
    log.info(f"Načítám výsledky: {url}")
    soup = get_page(url)
    if not soup:
        return []

    games = []
    current_date = None

    # Tabulka výsledků
    table = soup.find("table")
    if not table:
        log.warning("Nenalezena tabulka výsledků")
        return []

    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if not cells:
            continue

        # Řádek s datem
        date_cell = cells[0].get_text(strip=True)
        if re.match(r"\d{2}\.\d{2}\.\d{4}", date_cell):
            current_date = parse_date_cz(date_cell)

        # Hledej odkaz na detail zápasu (obsahuje skóre)
        score_link = None
        for cell in cells:
            link = cell.find("a", href=re.compile(r"/zapas/"))
            if link:
                score_link = link
                break

        if not score_link or current_date is None:
            continue

        score_text = score_link.get_text(strip=True)
        detail_path = score_link.get("href", "")
        detail_url = BASE_URL + detail_path if detail_path.startswith("/") else detail_path

        goals_home, goals_away, ot_so = parse_score(score_text)

        # Týmy — jsou v buňkách vedle skóre
        team_cells = [c for c in cells if c.find("a", href=re.compile(r"/tym/"))]
        if len(team_cells) >= 2:
            home_raw = team_cells[0].get_text(strip=True)
            away_raw = team_cells[1].get_text(strip=True)
        else:
            # fallback: z URL detailu
            m = re.search(r"/zapas/(.+?)-VS-(.+?)/", detail_path)
            if m:
                home_raw = m.group(1).replace("-", " ").title()
                away_raw = m.group(2).replace("-", " ").title()
            else:
                continue

        home_code = normalize_team_name(home_raw)
        away_code = normalize_team_name(away_raw)

        games.append({
            "date": current_date,
            "home_team": home_code,
            "away_team": away_code,
            "goals_home": goals_home,
            "goals_away": goals_away,
            "ot_so": ot_so,
            "detail_url": detail_url,
            "source": "hokejportal.cz",
        })

    log.info(f"  Nalezeno {len(games)} zápasů na stránce výsledků")
    return games


def scrape_game_detail(detail_url: str) -> dict:
    """
    Scrapuje detailní stránku zápasu.
    Vrací: {shots_home, shots_away, period_scores: [(h,a), ...], goals: [...]}
    """
    soup = get_page(detail_url, delay=2.0)
    if not soup:
        return {}

    detail = {"detail_url": detail_url}

    # Střely — v tabulce statistik
    stats_tables = soup.find_all("table")
    for t in stats_tables:
        text = t.get_text()
        if "Střely" in text or "Strely" in text or "Štatistiky" in text:
            cells = t.find_all("td")
            for i, cell in enumerate(cells):
                ct = cell.get_text(strip=True)
                if ct in ("Střely", "Strely", "Střely na bránu"):
                    # hodnoty jsou v buňkách vlevo a vpravo
                    if i > 0:
                        try:
                            detail["shots_home"] = int(cells[i-1].get_text(strip=True))
                        except (ValueError, IndexError):
                            pass
                    if i < len(cells) - 1:
                        try:
                            detail["shots_away"] = int(cells[i+1].get_text(strip=True))
                        except (ValueError, IndexError):
                            pass
                    break

    # Skóre po třetinách
    period_scores = []
    period_sections = soup.find_all(string=re.compile(r"\d\. tret"))
    for sec in period_sections:
        parent = sec.find_parent()
        if not parent:
            continue
        # Hledá "X:Y" pattern poblíž
        text = parent.get_text()
        m = re.search(r"(\d+):(\d+)", text)
        if m:
            period_scores.append((int(m.group(1)), int(m.group(2))))
    detail["period_scores"] = period_scores

    # Góly — tabulky průběhu zápasu
    goals = []
    for row in soup.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        row_text = row.get_text()
        # Detekce řádku s gólem: obsahuje minutu a jméno hráče
        time_match = re.search(r"(\d{1,3})'", row_text)
        score_match = re.search(r"(\d+):(\d+)", row_text)
        if time_match and score_match:
            goals.append({
                "minute": int(time_match.group(1)),
                "score_after": f"{score_match.group(1)}:{score_match.group(2)}",
                "raw": row_text.strip()[:120],
            })
    detail["goals"] = goals

    return detail


def scrape_standings(season: str = "2025-2026") -> list[dict]:
    """
    Scrapuje tabulku sezóny.
    Vrací: [{rank, team_code, team_name, games, wins, wins_ot, losses_ot, losses, gf, ga, points}]
    """
    url = f"{STANDINGS_URL}?season={season}"
    log.info(f"Načítám tabulku: {url}")
    soup = get_page(url)
    if not soup:
        return []

    standings = []
    tables = soup.find_all("table")

    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 5:
            continue

        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 9:
                continue

            rank_text = cells[0].get_text(strip=True).replace(".", "")
            if not rank_text.isdigit():
                continue

            team_link = cells[1].find("a")
            if not team_link:
                continue

            team_name = team_link.get_text(strip=True)
            team_code = normalize_team_name(team_name)

            nums = []
            for c in cells[2:]:
                t = c.get_text(strip=True)
                # Parsuje "165:117" jako dvě čísla
                if ":" in t:
                    parts = t.split(":")
                    nums.extend(parts)
                else:
                    nums.append(t)

            def safe_int(lst, idx):
                try:
                    return int(lst[idx])
                except (IndexError, ValueError):
                    return None

            # Sloupce: Z, V, VP, PP, P, +/-, GF:GA (jako dvě), Forma, Body
            standings.append({
                "rank": int(rank_text),
                "team_code": team_code,
                "team_name": team_name,
                "games":    safe_int(nums, 0),
                "wins":     safe_int(nums, 1),
                "wins_ot":  safe_int(nums, 2),
                "losses_ot":safe_int(nums, 3),
                "losses":   safe_int(nums, 4),
                "diff":     safe_int(nums, 5),
                "gf":       safe_int(nums, 6),
                "ga":       safe_int(nums, 7),
                "points":   safe_int(nums, 9),  # skip forma column
            })
        if standings:
            break  # První platná tabulka

    log.info(f"  Tabulka: {len(standings)} týmů")
    return standings


def run_scrape(season: str = "2025-2026", dry_run: bool = False,
               max_games: int = 0, with_details: bool = False):
    """
    Hlavní pipeline:
    1. Scrapuje přehled výsledků
    2. Volitelně stahuje detaily zápasů
    3. Uloží do databáze (pokud ne dry_run)
    """
    log.info(f"=== Spouštím scraper (sezóna: {season}, dry_run: {dry_run}) ===")

    games = scrape_results_page(season)
    if max_games:
        games = games[:max_games]

    if with_details:
        log.info(f"Stahuji detaily {len(games)} zápasů...")
        for i, game in enumerate(games):
            if game.get("detail_url"):
                log.info(f"  [{i+1}/{len(games)}] {game['home_team']} vs {game['away_team']} ({game['date']})")
                detail = scrape_game_detail(game["detail_url"])
                game.update(detail)

    standings = scrape_standings(season)

    if dry_run:
        log.info("--- DRY RUN výstup ---")
        for g in games[:5]:
            print(f"  {g['date']} | {g['home_team']} {g.get('goals_home','?')}:{g.get('goals_away','?')} {g['away_team']} | ot_so={g['ot_so']}")
        print(f"\nTabulka (top 5):")
        for s in standings[:5]:
            print(f"  {s['rank']}. {s['team_name']} — {s.get('points')} bodů")
        return games, standings

    # Uložení do DB
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../backend"))
        from database import SessionLocal
        import models

        db = SessionLocal()
        saved = 0
        skipped = 0

        # Načti sezónu a týmy
        season_code = season.replace("20", "").replace("-20", "/") if "-" in season else season
        db_season = db.query(models.Season).filter_by(code=season_code).first()
        if not db_season:
            log.error(f"Sezóna '{season_code}' nenalezena v DB. Spusťte nejdřív import_excel.py.")
            db.close()
            return games, standings

        for game in games:
            home = db.query(models.Team).filter_by(code=game["home_team"]).first()
            away = db.query(models.Team).filter_by(code=game["away_team"]).first()

            if not home or not away:
                log.debug(f"  Přeskakuji (tým nenalezen): {game['home_team']} vs {game['away_team']}")
                skipped += 1
                continue

            # Zkontroluj duplicitu
            existing = db.query(models.Game).filter_by(
                date=game["date"],
                home_team_id=home.id,
                away_team_id=away.id,
            ).first()

            if existing:
                # Aktualizuj pokud chybí data
                updated = False
                if existing.goals_home is None and game.get("goals_home") is not None:
                    existing.goals_home = game["goals_home"]
                    existing.goals_away = game["goals_away"]
                    existing.ot_so = game["ot_so"]
                    updated = True
                if game.get("shots_home") and existing.shots_home is None:
                    existing.shots_home = game["shots_home"]
                    existing.shots_away = game.get("shots_away")
                    updated = True
                if updated:
                    saved += 1
                else:
                    skipped += 1
                continue

            # Výsledek domácích
            result_home = None
            gh = game.get("goals_home")
            ga = game.get("goals_away")
            ot = game.get("ot_so", 0)
            if gh is not None and ga is not None:
                if gh > ga:
                    result_home = "OTW" if ot else "W"
                else:
                    result_home = "OTL" if ot else "L"

            new_game = models.Game(
                season_id=db_season.id,
                home_team_id=home.id,
                away_team_id=away.id,
                date=game["date"],
                game_type="RS",
                goals_home=game.get("goals_home"),
                goals_away=game.get("goals_away"),
                shots_home=game.get("shots_home"),
                shots_away=game.get("shots_away"),
                ot_so=game.get("ot_so", 0),
                result_home=result_home,
            )
            db.add(new_game)
            saved += 1

        db.commit()
        db.close()
        log.info(f"✅ Uloženo: {saved} zápasů | Přeskočeno: {skipped}")

    except ImportError as e:
        log.warning(f"DB import selhal ({e}) — výsledky jen v paměti")

    return games, standings


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scraper extraligy z hokejportal.cz")
    parser.add_argument("--season", default="2025-2026", help="Sezóna ve formátu 2025-2026")
    parser.add_argument("--dry-run", action="store_true", help="Jen vypíše data, neuloží do DB")
    parser.add_argument("--max", type=int, default=0, help="Maximální počet zápasů (0 = vše)")
    parser.add_argument("--details", action="store_true", help="Stáhne i detailní stránky zápasů (střely)")
    args = parser.parse_args()

    run_scrape(
        season=args.season,
        dry_run=args.dry_run,
        max_games=args.max,
        with_details=args.details,
    )
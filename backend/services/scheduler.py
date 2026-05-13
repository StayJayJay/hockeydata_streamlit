"""
Scheduler pro automatické stahování dat z hokejportal.cz
Spuštění: python scheduler.py

Plán:
  - Každý den v 01:00 — stáhne výsledky z předchozího dne
  - Každý týden v neděli v 02:00 — plná synchronizace sezóny
  - Endpoint POST /scraper/run — ruční spuštění přes API
"""

import threading
import time
import logging
from datetime import datetime
from typing import Optional

log = logging.getLogger("scheduler")


class ScraperScheduler:
    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._last_run: Optional[datetime] = None
        self._last_status: str = "Nikdy nespuštěno"
        self._last_count: int = 0

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        log.info("Scheduler spuštěn")

    def stop(self):
        self._running = False
        log.info("Scheduler zastaven")

    def _loop(self):
        while self._running:
            now = datetime.now()

            # Denní scrape v 01:00
            if now.hour == 1 and now.minute == 0:
                log.info("Spouštím denní scrape...")
                self._run_scrape(full=False)
                time.sleep(61)  # přeskočí minutu aby nespustil 2x

            # Týdenní plná synchronizace v neděli ve 02:00
            elif now.weekday() == 6 and now.hour == 2 and now.minute == 0:
                log.info("Spouštím týdenní plnou synchronizaci...")
                self._run_scrape(full=True)
                time.sleep(61)

            time.sleep(30)  # kontrola každých 30s

    def _run_scrape(self, full: bool = False):
        try:
            from services.scraper import run_scrape
            season = "2025-2026"
            games, standings = run_scrape(
                season=season,
                dry_run=False,
                with_details=full,
            )
            self._last_run = datetime.now()
            self._last_count = len(games)
            self._last_status = f"OK — {len(games)} zápasů, {len(standings)} týmů v tabulce"
            log.info(f"Scrape dokončen: {self._last_status}")
        except Exception as e:
            self._last_status = f"Chyba: {str(e)}"
            log.error(f"Scrape selhal: {e}")

    def run_now(self, full: bool = False) -> dict:
        """Ruční spuštění — volá se z API endpointu."""
        thread = threading.Thread(target=self._run_scrape, args=(full,), daemon=True)
        thread.start()
        return {"message": "Scrape spuštěn", "full": full}

    def status(self) -> dict:
        return {
            "running": self._running,
            "last_run": self._last_run.isoformat() if self._last_run else None,
            "last_status": self._last_status,
            "last_count": self._last_count,
        }


# Singleton
scheduler = ScraperScheduler()
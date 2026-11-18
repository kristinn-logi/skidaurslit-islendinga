#!/usr/bin/env python3
"""Scrape every men's alpine race held in Scandinavia in a date window, with full results.

Built to find the races where first-year FIS athletes had the best chance to score
low points. Defaults: NOR/SWE/FIN/DEN, November-December 2025 (season 2026),
first-year birth year 2009.

Sources (public pages on fis-ski.com):
  * calendar        /DB/alpine-skiing/calendar-results.html   (events per nation and month)
  * event details   /DB/general/event-details.html            (races in an event)
  * race results    /DB/general/results.html                  (parsed with fis_scraper.parse_race)

The race penalty is not on the results page. The winner's race points are 0, so the
winner's FIS points equal the applied penalty. That is reported as `penalty`.
`calculated_penalty` is the value before the category minimum is applied (see penalty.py).

Outputs in <out>/:
  races.csv    one row per men's race (cancelled ones included, flagged)
  results.csv  one row per competitor per race (finishers and DNF/DNS/DSQ)
  race_ranking.csv  races ranked per discipline by how favourable they were (see ranking.py)

Usage:
  ../.venv/bin/python scrape_races.py
  ../.venv/bin/python scrape_races.py --nations NOR SWE --months 11-2025 12-2025 --first-year 2009
"""
from __future__ import annotations

import argparse
import re
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fis_scraper import (BASE, RACE_URL, Fetcher, children, parse_race, text, to_float,
                         write_csv)  # noqa: E402
from penalty import add_calculated_penalties  # noqa: E402
from ranking import rank_races  # noqa: E402

CALENDAR_URL = f"{BASE}/alpine-skiing/calendar-results.html"
EVENT_URL = f"{BASE}/general/event-details.html"
DISCIPLINES = {"Slalom": "SL", "Giant Slalom": "GS", "Super G": "SG", "Super-G": "SG",
               "Downhill": "DH", "Alpine combined": "AC", "Alpine Combined": "AC",
               "Team Combined": "TC", "Parallel Slalom": "PSL", "Parallel Giant Slalom": "PGS",
               "Parallel": "PAR"}


def season_code(month: str) -> int:
    m, y = map(int, month.split("-"))
    return y + 1 if m >= 7 else y


def get_event_ids(f: Fetcher, nation: str, month: str) -> set[int]:
    params = {"eventselection": "", "place": "", "sectorcode": "AL",
              "seasoncode": season_code(month), "categorycode": "", "disciplinecode": "",
              "gendercode": "M", "racedate": "", "racecodex": "", "nationcode": nation,
              "seasonmonth": month, "saveselection": "-1", "seasonselection": ""}
    html = f.get(CALENDAR_URL, params)
    return {int(m) for m in re.findall(r"event-details\.html\?[^\"']*eventid=(\d+)", html)}


def get_event_races(f: Fetcher, event_id: int, season: int, nation: str) -> list[dict]:
    html = f.get(EVENT_URL, {"sectorcode": "AL", "eventid": event_id, "seasoncode": season})
    soup = BeautifulSoup(html, "lxml")
    venue = text(soup.select_one("h1"))
    races = []
    for row in soup.select("div.table-row"):
        a = row.select_one('a[href*="raceid="]')
        if a is None:
            continue
        cells = [text(c) for c in row.select("div.g-row > a")]
        # cells: status | date | codex | "<discipline> <place> (NAT)" | "<discipline> <cat> <gender>"
        #        | category | gender | ... | remarks (e.g. "Cat. CIT")
        if len(cells) < 7:
            continue
        flags = [s.get("title", "") for s in row.select(".status__item")]
        date_el = row.select_one(".timezone-date[data-date]")
        title = cells[4]
        discipline = re.sub(rf"\s+{re.escape(cells[5])}\s+{re.escape(cells[6])}$", "", title)
        races.append({
            "raceid": int(re.search(r"raceid=(\d+)", a["href"])[1]),
            "event_id": event_id,
            "date": date_el["data-date"] if date_el else cells[1],
            "codex": cells[2],
            "venue": re.sub(r"\s*\(\w{3}\)\s*$", "", venue).strip(),
            "nation": nation,
            "category": cells[5],
            "gender": cells[6],
            "discipline": discipline,
            "discipline_code": DISCIPLINES.get(discipline, ""),
            "remarks": " ".join(dict.fromkeys(c for c in cells[7:] if c)),
            "cancelled": "Cancelled" in flags,
            "has_results": "Data available" in flags,
        })
    return races


def identities(html: str) -> dict[str, tuple[str, str, str]]:
    """fiscode -> (athlete, birth year, nation) for every row, finishers or not.

    parse_race drops these for non-finishers, whose rows are one cell short of the header."""
    out = {}
    for a in BeautifulSoup(html, "lxml").select('a.table-row[href*="athlete-biography"]'):
        cells = [text(c) for c in children(a.select_one("div.g-row.justify-sb"))]
        if len(cells) >= 6:
            out.setdefault(cells[2], (cells[3], cells[4], cells[5]))
    return out


def summarize(race: dict, rows: list[dict], first_year: int) -> dict:
    """Field size and first-year stats for one race."""
    starters = [r for r in rows if not r["status"].startswith("Did not start")]
    finishers = [r for r in rows if not r["status"] and r["fis_points"] is not None]
    pts = sorted(r["fis_points"] for r in finishers)
    fy_start = [r for r in starters if r["birth_year"] == first_year]
    fy_fin = sorted((r for r in finishers if r["birth_year"] == first_year),
                    key=lambda r: r["fis_points"])
    fy_pts = [r["fis_points"] for r in fy_fin]
    return {
        "starters": len(starters),
        "finishers": len(finishers),
        "finish_rate": round(len(finishers) / len(starters), 3) if starters else None,
        "penalty": pts[0] if pts else None,
        "pts_10th": pts[9] if len(pts) >= 10 else None,
        "pts_median": statistics.median(pts) if pts else None,
        "first_year_starters": len(fy_start),
        "first_year_finishers": len(fy_fin),
        "first_year_finish_rate": round(len(fy_fin) / len(fy_start), 3) if fy_start else None,
        "first_year_best_pts": fy_pts[0] if fy_pts else None,
        "first_year_best_rank": fy_fin[0]["rank"] if fy_fin else None,
        "first_year_median_pts": statistics.median(fy_pts) if fy_pts else None,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nations", nargs="+", default=["NOR", "SWE", "FIN", "DEN"])
    ap.add_argument("--months", nargs="+", default=["11-2025", "12-2025"], help="MM-YYYY")
    ap.add_argument("--first-year", type=int, default=2009,
                    help="birth year of first-year FIS athletes in that season")
    ap.add_argument("--peer-years", type=int, default=3,
                    help="birth years (ending at --first-year) used to rank races")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "data"))
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between requests")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--refresh", action="store_true", help="ignore the cache")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    f = Fetcher(out / "cache", args.delay, args.refresh)
    pool = ThreadPoolExecutor(args.workers)

    # --- calendar -> events -> men's races
    events: dict[int, tuple[str, int]] = {}
    for nation in args.nations:
        for month in args.months:
            for eid in get_event_ids(f, nation, month):
                events[eid] = (nation, season_code(month))
    print(f"{len(events)} events in {', '.join(args.nations)} for {', '.join(args.months)}")

    month_keys = {tuple(map(int, m.split("-"))) for m in args.months}  # (month, year)
    races = []
    for event_races in pool.map(lambda e: get_event_races(f, e[0], e[1][1], e[1][0]), events.items()):
        for r in event_races:
            y, m = int(r["date"][:4]), int(r["date"][5:7])
            if r["gender"] == "M" and (m, y) in month_keys:
                races.append(r)
    races.sort(key=lambda r: (r["date"], r["nation"], r["venue"], r["codex"]))
    print(f"{len(races)} men's races ({sum(r['cancelled'] for r in races)} cancelled)")

    # --- results
    to_fetch = [r for r in races if not r["cancelled"] and r["has_results"]]
    htmls = pool.map(lambda r: f.get(RACE_URL, {"sectorcode": "AL", "raceid": r["raceid"]}), to_fetch)
    results = []
    for race, html in zip(to_fetch, htmls):
        try:
            parsed = parse_race(html)
        except Exception as e:  # team events and other odd formats
            print(f"  could not parse race {race['raceid']}: {e}", file=sys.stderr)
            continue
        ids = identities(html)
        rows = []
        for code, row in parsed["rows"].items():
            name, year, nat = ids.get(code, ("", "", ""))
            rows.append({
                "raceid": race["raceid"], "date": race["date"], "venue": race["venue"],
                "nation_host": race["nation"], "category": race["category"],
                "discipline_code": race["discipline_code"],
                "rank": int(row["rank"]) if row["rank"].isdigit() else None,
                "bib": row["bib"], "fis_code": code, "athlete": name,
                "birth_year": int(year) if year.isdigit() else None,
                "nation": nat,
                "run1": row.get("Run 1", ""), "run2": row.get("Run 2", ""),
                "total_time": row.get("Tot. Time", ""), "diff_time": row.get("Diff. Time", ""),
                "fis_points": to_float(row.get("FIS Points")),
                "points_2027": to_float(row.get("2027 points")),
                "status": row["status"],
            })
        race["parsed_ok"] = True
        results += rows

    by_race: dict[int, list[dict]] = {}
    for r in results:
        by_race.setdefault(r["raceid"], []).append(r)
    for race in races:
        if race.get("parsed_ok"):
            race.update(summarize(race, by_race.get(race["raceid"], []), args.first_year))
    add_calculated_penalties(f, races, by_race)
    for race in races:
        race.pop("parsed_ok", None)
        race["url"] = f"{RACE_URL}?sectorcode=AL&raceid={race['raceid']}"

    write_csv(out / "races.csv", races)
    write_csv(out / "results.csv", results)
    write_csv(out / "race_ranking.csv", rank_races(races, results, args.first_year, args.peer_years))
    print(f"done: {f.fetched} fetched, {f.hits} from cache")


if __name__ == "__main__":
    main()

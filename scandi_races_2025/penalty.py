"""Recompute the calculated race penalty, which FIS hides when it is raised to the minimum.

FIS shows only the applied penalty (= the winner's FIS points). When the calculated value is
below the category minimum (23.00 FIS/NJR, 60.00 ENL, 15.00 EC) the minimum is applied and the
real field strength is lost. This recomputes it from the points list valid on race day:

    penalty = (A + B - C) / 10
    A  sum of the 5 best list points among the top 10 finishers
    B  sum of the 5 best list points among all starters (DNS excluded, DNF/DSQ included)
    C  sum of the race points of the 5 athletes counted in A

Athletes without points, or above the discipline maximum, count at the maximum. When athletes
tie on list points (typically several with no points), the one with the highest race points
is counted. Race points = FIS points - applied penalty.
"""
from __future__ import annotations

import hashlib
from datetime import date

from fis_scraper import Fetcher, get_list_rows, get_points_lists, to_float

MAX_POINTS = {"SL": 165.0, "GS": 220.0, "SG": 270.0, "DH": 330.0}
SKIP_CATEGORIES = {"WC", "EC"}  # WC/EC penalties use different rules; they don't concern first-years


def load_lists(f: Fetcher, race_dates: list[date], codes: set[str]) -> tuple[list[dict], dict]:
    """The points lists covering `race_dates`, with only the rows for `codes`."""
    lo, hi = min(race_dates), max(race_dates)
    lists = [l for l in get_points_lists(f, lo) if l["valid_from"] and l["valid_from"] <= hi]
    tag = "codes:" + hashlib.sha1(",".join(sorted(codes)).encode()).hexdigest()[:12]
    rows = {l["listid"]: get_list_rows(f, l, lambda r: r.get("Fiscode") in codes, tag, False)
            for l in lists}
    return lists, rows


def list_for(lists: list[dict], d: date) -> dict | None:
    return next((l for l in lists if l["valid_from"] <= d <= (l["valid_to"] or date.max)), None)


def calculate(race: dict, results: list[dict], list_rows: dict) -> float | None:
    disc, applied = race["discipline_code"], race.get("penalty")
    if disc not in MAX_POINTS or applied is None or race["category"] in SKIP_CATEGORIES:
        return None
    cap = MAX_POINTS[disc]

    def pts(code: str) -> float:
        v = to_float(list_rows.get(code, {}).get(f"{disc}points"))
        return cap if v is None else min(v, cap)

    starters = [r for r in results if not r["status"].startswith("Did not start 1st")]
    top10 = [r for r in results if r["rank"] and r["rank"] <= 10 and r["fis_points"] is not None]
    for r in top10:
        r["_race_pts"] = r["fis_points"] - applied
    counted = sorted(top10, key=lambda r: (pts(r["fis_code"]), -r["_race_pts"]))[:5]
    a = sum(pts(r["fis_code"]) for r in counted) + cap * (5 - len(counted))
    b = sum((sorted(pts(r["fis_code"]) for r in starters) + [cap] * 5)[:5])
    c = sum(r["_race_pts"] for r in counted)
    return round((a + b - c) / 10, 2)


def add_calculated_penalties(f: Fetcher, races: list[dict], by_race: dict[int, list[dict]]):
    """Set `calculated_penalty`, `points_list` and `at_minimum` on every race with results."""
    scored = [r for r in races if r.get("parsed_ok")]
    if not scored:
        return
    codes = {x["fis_code"] for r in scored for x in by_race.get(r["raceid"], [])}
    lists, rows = load_lists(f, [date.fromisoformat(r["date"]) for r in scored], codes)
    for race in scored:
        lst = list_for(lists, date.fromisoformat(race["date"]))
        if lst is None:
            continue
        calc = calculate(race, by_race.get(race["raceid"], []), rows[lst["listid"]])
        race["points_list"] = lst["list_name"]
        race["calculated_penalty"] = calc
        if calc is not None:
            race["at_minimum"] = calc < race["penalty"] - 0.01

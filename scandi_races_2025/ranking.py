"""Rank races by how favourable they were for young athletes to score FIS points.

The first-year median mostly reflects who entered a race. Instead, compare each athlete with
themselves: per discipline, fit

    fis_points[athlete, race] = athlete_level + race_effect

on finishers born in the peer window (default 2007-2009 for first-year 2009), using
athletes with at least two finishes in that discipline. `race_effect` is how many points
better (negative) or worse the same athletes scored there than in their other races.
It is shrunk towards 0 when few comparable athletes raced (SHRINK pseudo-observations),
and centred so the average race is 0.

Finish rate, best result and sample size are reported alongside, not folded into the score.
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict

SHRINK = 5.0  # pseudo-athletes at effect 0 added to each race
SKIP_CATEGORIES = {"WC", "EC"}  # first-years can't enter these


def fit_race_effects(rows: list[tuple[str, int, float]]) -> tuple[dict[int, float], Counter]:
    """rows: (athlete, raceid, points). Returns centred race effects and per-race counts."""
    n_races = Counter(a for a, _, _ in rows)
    rows = [r for r in rows if n_races[r[0]] >= 2]
    per_race = Counter(rid for _, rid, _ in rows)
    level: dict[str, float] = defaultdict(float)
    effect: dict[int, float] = defaultdict(float)
    for _ in range(500):
        sums = defaultdict(float)
        for a, rid, p in rows:
            sums[rid] += p - level[a]
        new = {rid: s / (per_race[rid] + SHRINK) for rid, s in sums.items()}
        groups = defaultdict(list)
        for a, rid, p in rows:
            groups[a].append(p - new[rid])
        level = defaultdict(float, {a: statistics.fmean(v) for a, v in groups.items()})
        delta = max((abs(new[k] - effect[k]) for k in new), default=0)
        effect = defaultdict(float, new)
        if delta < 1e-6:
            break
    mid = statistics.fmean(effect.values()) if effect else 0.0
    return {rid: e - mid for rid, e in effect.items()}, per_race


def rank_races(races: list[dict], results: list[dict], first_year: int,
               peer_years: int = 3) -> list[dict]:
    peers = range(first_year - peer_years + 1, first_year + 1)
    ranked = []
    for disc in ("SL", "GS", "SG", "DH"):
        pool = {r["raceid"]: r for r in races
                if r["discipline_code"] == disc and r["category"] not in SKIP_CATEGORIES
                and r.get("finishers")}
        rows = [(x["fis_code"], x["raceid"], x["fis_points"]) for x in results
                if x["raceid"] in pool and x["fis_points"] is not None and not x["status"]
                and x["birth_year"] in peers]
        if not rows:
            continue
        effects, counts = fit_race_effects(rows)
        order = sorted(effects, key=effects.get)
        for i, rid in enumerate(order, 1):
            r = pool[rid]
            ranked.append({
                "discipline": disc, "rank": i, "race_effect": round(effects[rid], 1),
                "comparable_athletes": counts[rid],
                **{k: r.get(k) for k in (
                    "date", "venue", "nation", "category", "codex",
                    "first_year_starters", "first_year_finish_rate", "first_year_best_pts",
                    "first_year_median_pts", "penalty", "calculated_penalty", "starters",
                    "url")},
            })
    return ranked

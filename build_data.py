#!/usr/bin/env python3
"""Turn the scraper's CSVs (data/*.csv) into app/data.js for the dashboard.

The output is `window.D = {...}` in the shape comparison_is.html uses, so the app
works when opened straight from disk (file://) without a web server.

Usage:
  .venv/bin/python build_data.py              # data/ -> app/data.js
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from bisect import bisect_right
from datetime import date
from pathlib import Path

DISCS = ["SL", "GS", "SG", "DH"]
FIS_RACE_URL = "https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid={}"
EXCLUDED_CATS = {"TRA"}  # training races give no FIS points
FEED_SIZE = 150


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def num(s: str) -> float | None:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def inum(s: str) -> int | None:
    return int(s) if s and s.isdigit() else None


def season_of(d: date) -> int:
    """FIS season code: 2026 = the 2025/26 season (July-June)."""
    return d.year + 1 if d.month >= 7 else d.year


def kind_of(position: str) -> str:
    """fin / dnf / dsq / dnq / dns from the result page's position column."""
    p = position.upper()
    if p.isdigit():
        return "fin"
    for k in ("DSQ", "DNQ", "DNS"):
        if k in p:
            return k.lower()
    return "dnf"  # DNF, DNF1, DNF2, BDNF1, ...


# ---------------------------------------------------------------------- names

class Names:
    """FIS stores names in ASCII capitals; restore Icelandic spelling where we can."""

    def __init__(self, path: Path):
        self.map = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    def __call__(self, s: str) -> str:
        s = " ".join(w.title() if w.isupper() else w for w in s.split())
        if s in self.map:
            return self.map[s]
        words = [self.map.get(w, w) for w in s.split()]
        # "-dottir" is always "-dóttir" in an Icelandic patronymic
        return " ".join(re.sub(r"dottir$", "dóttir", w) for w in words)


# ---------------------------------------------------------------------- build

def build(data: Path, names: Names) -> dict:
    lists_meta = read_csv(data / "points_lists.csv")
    wide = read_csv(data / "points_timeseries_wide.csv")
    results = read_csv(data / "results.csv")
    latest = read_csv(data / "latest_list.csv")
    athletes_csv = {r["fis_code"]: r for r in read_csv(data / "athletes.csv")}

    latest_id = max(int(l["listid"]) for l in lists_meta)
    latest_meta = next(l for l in lists_meta if int(l["listid"]) == latest_id)

    # seasons: the current season counts once the northern season is under way
    # (from 1 Dec); before that its only content is recalculated lists
    today = date.today()
    s1 = season_of(today) if (today.month == 12 or today.month < 7) else season_of(today) - 1
    seasons = list(range(s1 - 3, s1 + 1))

    # lists per athlete, oldest first
    lists_by: dict[str, list[dict]] = {}
    for r in wide:
        e = {"listid": int(r["listid"]), "season": int(r["season"]), "from": r["valid_from"]}
        for d in DISCS:
            e[d] = num(r[f"{d}_points"])
            e[d + "r"] = inum(r[f"{d}_rank"])
        pts = sorted(e[d] for d in DISCS if e[d] is not None)
        e["level"] = round(sum(pts[:2]) / len(pts[:2]), 2) if pts else None
        lists_by.setdefault(r["fis_code"], []).append(e)
    for ls in lists_by.values():
        ls.sort(key=lambda e: (e["from"], e["listid"]))

    def own_points(code: str, disc: str, day: str) -> float | None:
        """Points in `disc` on the list that was valid on `day`."""
        ls = lists_by.get(code, [])
        i = bisect_right([e["from"] for e in ls], day) - 1
        return ls[i].get(disc) if i >= 0 else None

    starts_by: dict[str, list[dict]] = {}
    feed = []
    for r in results:
        if r["category_code"] in EXCLUDED_CATS or not r["date"]:
            continue
        code, disc, kind = r["fis_code"], r["discipline_code"] or r["discipline"], kind_of(r["position"])
        own = own_points(code, disc, r["date"]) if kind == "fin" and disc in DISCS else None
        s = {"date": r["date"], "season": int(r["season"]), "disc": disc, "cat": r["category_code"],
             "place": r["place"], "nation": r["nation"], "pos": r["position"], "race": r["raceid"],
             "kind": kind, "detail": r.get("race_status_detail", ""), "pen": num(r.get("winner_fis_points"))}
        if kind == "fin":
            s.update({"behind": num(r.get("pct_behind_winner")), "nfin": inum(r.get("finishers", "")),
                      "nstart": inum(r.get("starters", "")), "pts": num(r["fis_points"])})
            s["own"] = own
            s["delta"] = round(s["pts"] - own, 2) if own is not None and s["pts"] is not None else None
        feed.append({"code": code, "date": r["date"], "disc": disc, "cat": r["category_code"],
                     "place": r["place"], "nation": r["nation"], "pos": r["position"], "kind": kind,
                     "pts": num(r["fis_points"]), "cup": num(r["cup_points"]), "own": own,
                     "race": r["raceid"], "url": FIS_RACE_URL.format(r["raceid"]),
                     "raceName": r.get("race_name", "")})
        if kind != "dns":  # did not start: not a start
            starts_by.setdefault(code, []).append(s)

    athletes = []
    for r in latest:
        code = r["Fiscode"]
        p = athletes_csv.get(code, {})
        athletes.append({
            "code": code, "first": names(r["Firstname"]), "last": names(r["Lastname"]),
            "gender": r["Gender"], "born": p.get("birthdate") or r["Birthdate"], "year": inum(r["Birthyear"]),
            "club": names.map.get(r["Skiclub"], r["Skiclub"]),  # club acronyms (KR, SKA) stay as given
            "latest": {d: {"pts": num(r[f"{d}points"]), "rank": inum(r[f"{d}pos"]), "flag": r[f"{d}Sta"]}
                       for d in DISCS},
            "starts": sorted(starts_by.get(code, []), key=lambda s: (s["date"], s["race"])),
            "lists": lists_by.get(code, []),
        })

    codes = {a["code"] for a in athletes}
    feed = sorted((f for f in feed if f["code"] in codes), key=lambda f: (f["date"], f["race"]),
                  reverse=True)[:FEED_SIZE]
    return {
        "seasons": seasons, "last2": seasons[-2:],
        "latestList": latest_meta["list_name"], "latestDate": latest_meta["valid_from"],
        "built": today.isoformat(), "athletes": athletes, "feed": feed,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data")
    ap.add_argument("--names", default="names_is.json")
    ap.add_argument("--out", default="app/data.js")
    args = ap.parse_args()

    D = build(Path(args.data), Names(Path(args.names)))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("window.D = " + json.dumps(D, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    n = sum(len(a["starts"]) for a in D["athletes"])
    print(f"wrote {out}: {len(D['athletes'])} athletes, {n} starts, {len(D['feed'])} feed rows, "
          f"seasons {D['seasons'][0]}-{D['seasons'][-1]}")


if __name__ == "__main__":
    main()

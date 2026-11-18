#!/usr/bin/env python3
"""Scrape FIS alpine results and FIS points list history for a nation's athletes.

By default the athletes are every ISL athlete on the latest FIS points list;
--athletes athletes.json gives an explicit list instead.

Sources (all public pages on fis-ski.com):
  * points list index   /DB/alpine-skiing/fis-points-lists.html
  * points list export  /DB/fis_athletes/ajax/fispointslistfunctions/export_fispointslist.html
                        (CSV, filtered server-side by fiscode)
  * athlete results     /DB/general/athlete-biography.html?type=result
  * race results        /DB/general/results.html?raceid=...

Raw responses are cached under <out>/cache so reruns only fetch what changed.

Usage:
  .venv/bin/python fis_scraper.py                       # last 5 seasons, all ISL athletes
  .venv/bin/python fis_scraper.py --since 2023-07-01 --refresh
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.fis-ski.com/DB"
INDEX_URL = f"{BASE}/alpine-skiing/fis-points-lists.html"
EXPORT_URL = f"{BASE}/fis_athletes/ajax/fispointslistfunctions/export_fispointslist.html"
BIO_URL = f"{BASE}/general/athlete-biography.html"
RACE_URL = f"{BASE}/general/results.html"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")
DISCIPLINES = ["DH", "SG", "GS", "SL", "AC"]
DISCIPLINE_NAMES = {"Downhill": "DH", "Super G": "SG", "Super-G": "SG", "Giant Slalom": "GS",
                    "Slalom": "SL", "Alpine combined": "AC", "Alpine Combined": "AC",
                    "Combined": "AC", "Team Combined": "TC", "Parallel": "PAR",
                    "Parallel Giant Slalom": "PGS", "Parallel Slalom": "PSL"}


# --------------------------------------------------------------------------- http

class Fetcher:
    """requests.Session with an on-disk cache, a global rate limit and retries."""

    def __init__(self, cache_dir: Path, delay: float, refresh: bool):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.refresh = refresh
        self.session = requests.Session()
        self.session.headers["User-Agent"] = UA
        self._lock = threading.Lock()
        self._next_slot = 0.0
        self.hits = self.fetched = 0

    def _path(self, url: str, params: dict) -> Path:
        key = url + "?" + "&".join(f"{k}={params[k]}" for k in sorted(params))
        return self.cache_dir / (hashlib.sha1(key.encode()).hexdigest() + ".txt")

    def get(self, url: str, params: dict, *, cache: bool = True, store: bool = True) -> str:
        path = self._path(url, params)
        if cache and not self.refresh and path.exists():
            self.hits += 1
            return path.read_text(encoding="utf-8")
        for attempt in range(5):
            with self._lock:  # space requests out globally, across threads
                wait = self._next_slot - time.monotonic()
                self._next_slot = max(self._next_slot, time.monotonic()) + self.delay
            if wait > 0:
                time.sleep(wait)
            try:
                r = self.session.get(url, params=params, timeout=60)
                if r.status_code == 200:
                    r.encoding = "utf-8"
                    if store:
                        path.write_text(r.text, encoding="utf-8")
                    self.fetched += 1
                    return r.text
                if r.status_code not in (429, 500, 502, 503, 504):
                    r.raise_for_status()
            except requests.RequestException as e:
                if attempt == 4:
                    raise
                print(f"  retry {attempt + 1} {url} {params}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt * 2)
        raise RuntimeError(f"giving up on {url} {params}")


# --------------------------------------------------------------------------- helpers

def text(el) -> str:
    return el.get_text(" ", strip=True) if el is not None else ""


def parse_dmy(s: str) -> date | None:
    try:
        return datetime.strptime(s.strip(), "%d-%m-%Y").date()
    except ValueError:
        return None


def season_of(d: date) -> int:
    """FIS season code: 2026 = the 2025/26 season (July-June)."""
    return d.year + 1 if d.month >= 7 else d.year


def to_float(s: str) -> float | None:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def time_to_seconds(s: str) -> float | None:
    s = (s or "").strip().lstrip("+")
    if not re.fullmatch(r"(\d+:)?\d+(\.\d+)?", s):
        return None
    mins, _, secs = s.rpartition(":")
    return round(int(mins or 0) * 60 + float(secs), 2)


def children(el) -> list:
    return el.find_all("div", recursive=False) if el is not None else []


# --------------------------------------------------------------------------- points lists

def get_points_lists(f: Fetcher, since: date) -> list[dict]:
    """All alpine points lists valid on or after `since`, oldest first."""
    soup = BeautifulSoup(f.get(INDEX_URL, {}, cache=False), "lxml")
    lists = {}
    for a in soup.select('a[href*="fis-points-details.html"]'):
        m = re.search(r"seasoncode=(\d+)&(?:amp;)?listid=(\d+)", a["href"])
        if not m:
            continue
        dates = [parse_dmy(text(d)) for d in a.find_parent("div").find_next_siblings(
            "div", class_="hidden-sm-down", limit=2)]
        valid_from, valid_to = (dates + [None, None])[:2]
        lists[int(m[2])] = {
            "listid": int(m[2]), "season": int(m[1]), "list_name": text(a),
            "valid_from": valid_from, "valid_to": valid_to,
        }
    out = [l for l in lists.values()
           if (l["valid_to"] or l["valid_from"] or date.max) >= since]
    return sorted(out, key=lambda l: (l["valid_from"] or date.min, l["listid"]))


def get_list_rows(f: Fetcher, lst: dict, keep, tag: str, is_latest: bool) -> dict[str, dict]:
    """Rows of one whole points list that pass `keep`, keyed by fiscode.

    The full export is ~2 MB, so only the kept rows are cached (under `tag`)."""
    params = {"export_csv": "true", "sectorcode": "AL", "seasoncode": lst["season"],
              "listid": lst["listid"]}
    path = f._path(EXPORT_URL, {**params, "keep": tag})
    if not is_latest and not f.refresh and path.exists():
        f.hits += 1
        body = path.read_text(encoding="utf-8")
    else:
        reader = csv.DictReader(io.StringIO(f.get(EXPORT_URL, params, cache=False, store=False)))
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=reader.fieldnames or [])
        w.writeheader()
        w.writerows(r for r in reader if keep(r))
        body = buf.getvalue()
        path.write_text(body, encoding="utf-8")
    return {r["Fiscode"]: r for r in csv.DictReader(io.StringIO(body))}


# --------------------------------------------------------------------------- results

POSITION_RE = re.compile(r"^(\d+)$")


def get_bio_results(f: Fetcher, fiscode: str, refresh_bio: bool) -> list[dict]:
    params = {"sectorcode": "AL", "fiscode": fiscode, "type": "result", "limit": 2000}
    soup = BeautifulSoup(f.get(BIO_URL, params, cache=not refresh_bio), "lxml")
    out = []
    for a in soup.select("#results-body a.table-row"):
        m = re.search(r"raceid=(\d+)", a.get("href", ""))
        cells = children(a.select_one("div.container"))
        if not m or len(cells) < 7:
            continue
        # cells: date | place | (mobile place/discipline) | nation+cat | (cat code) |
        #        category | discipline | position / fis points / cup points
        race_date = parse_dmy(text(cells[0]))
        nation = text(a.select_one(".country__name-short"))
        cat_code = text(a.select_one("div.hidden-xs.hidden-md-up"))
        category = text(cells[5])
        discipline = text(cells[6])
        pos_cells = [text(c) for c in children(cells[7])] if len(cells) > 7 else []
        position, fis_pts, cup_pts = (pos_cells + ["", "", ""])[:3]
        rank = int(position) if POSITION_RE.match(position) else None
        out.append({
            "date": race_date, "season": season_of(race_date) if race_date else None,
            "place": text(cells[1]), "nation": nation, "category_code": cat_code,
            "category": category, "discipline": discipline,
            "discipline_code": DISCIPLINE_NAMES.get(discipline, ""),
            "position": position, "rank": rank,
            "status": "" if rank else position,
            "fis_points": to_float(fis_pts), "cup_points": to_float(cup_pts),
            "raceid": int(m[1]),
        })
    return out


def parse_race(html: str) -> dict:
    """Race header, and every competitor row keyed by fiscode."""
    soup = BeautifulSoup(html, "lxml")
    info = {"race_name": text(soup.select_one(".event-header__subtitle")),
            "race_kind": text(soup.select_one(".event-header__kind")),
            "codex": None, "event_id": None}
    m = re.search(r"window\.fisProperties\s*=\s*(\{.*?\});", html)
    if m:
        try:
            props = json.loads(m[1])
            info["codex"], info["event_id"] = props.get("competitionCodex"), props.get("eventId")
        except json.JSONDecodeError:
            pass

    body = soup.select_one("#events-info-results")
    header = []
    thead = body.find_previous("div", class_="thead") if body else None
    if thead is not None:
        header = [text(c) for c in thead.select("div.g-row.justify-sb > div")]

    rows, status = {}, ""
    # Finisher rows come first; each "Did not finish 2nd run" etc. heading starts a
    # new block of non-finishers, so walk rows and headings in document order.
    for el in soup.find_all(lambda t: (t.name == "a" and "table-row" in t.get("class", [])
                                       and "athlete-biography" in t.get("href", ""))
                            or (t.name == "div" and t.get("class") == ["g-xs-24", "bold"])):
        if el.name == "div":
            status = text(el)
            continue
        cells = [text(c) for c in children(el.select_one("div.g-row.justify-sb"))]
        if len(cells) < 6:
            continue
        rec = dict(zip(header, cells)) if len(cells) == len(header) else {}
        if "Time" in rec:  # single-run (speed) races label the total just "Time"
            rec["Tot. Time"] = rec.pop("Time")
        fiscode = cells[2]
        # first occurrence wins: final race rows precede any qualification-round rows
        rows.setdefault(fiscode, {"rank": cells[0], "bib": cells[1], "status": status, **rec})

    finishers = [r for r in rows.values() if not r["status"]]
    winner = next((r for r in finishers if r["rank"] == "1"), None)
    info.update({
        "starters": sum(1 for r in rows.values() if not r["status"].startswith("Did not start")),
        "finishers": len(finishers),
        "winner_time": winner.get("Tot. Time", "") if winner else "",
        "winner_fis_points": winner.get("FIS Points", "") if winner else "",
    })
    return {"info": info, "rows": rows}


def race_extras(race: dict, fiscode: str) -> dict:
    info, row = race["info"], race["rows"].get(fiscode, {})
    total = row.get("Tot. Time", "")
    diff = "" if row.get("rank") == "1" else row.get("Diff. Time", "")
    win_s, tot_s = time_to_seconds(info["winner_time"]), time_to_seconds(total)
    return {
        "race_name": info["race_name"], "race_kind": info["race_kind"],
        "codex": info["codex"], "bib": row.get("bib", ""),
        "run1": row.get("Run 1", ""), "run2": row.get("Run 2", ""),
        "total_time": total, "diff_time": diff,
        "pct_behind_winner": round((tot_s / win_s - 1) * 100, 2) if tot_s and win_s else None,
        "race_status_detail": row.get("status", ""),
        "starters": info["starters"], "finishers": info["finishers"],
        "winner_time": info["winner_time"], "winner_fis_points": info["winner_fis_points"],
    }


# --------------------------------------------------------------------------- output

def write_csv(path: Path, rows: list[dict], fields: list[str] | None = None):
    # union of all rows' keys, in first-seen order: a row without race details must
    # not drop those columns for everyone
    fields = fields or list(dict.fromkeys(k for r in rows for k in r))
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})
    print(f"  wrote {path} ({len(rows)} rows)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nation", default="ISL",
                    help="follow every athlete of this nation on the latest points list")
    ap.add_argument("--athletes", help="JSON file with an explicit athlete list (overrides --nation)")
    ap.add_argument("--since", help="YYYY-MM-DD (default: start of the season 5 years ago)")
    ap.add_argument("--fresh-days", type=int, default=14,
                    help="refetch race pages this recent, since FIS corrects results")
    ap.add_argument("--out", default="data")
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between requests")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--refresh", action="store_true", help="ignore the cache entirely")
    ap.add_argument("--no-race-details", action="store_true", help="skip per-race pages")
    args = ap.parse_args()

    today = date.today()
    since = (date.fromisoformat(args.since) if args.since
             else date(season_of(today) - 6, 7, 1))  # e.g. 2021-07-01 when run in 2026/27
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    f = Fetcher(out / "cache", args.delay, args.refresh)
    pool = ThreadPoolExecutor(args.workers)
    if args.athletes:
        athletes = json.loads(Path(args.athletes).read_text())["athletes"]
        codes = {a["fis_code"] for a in athletes}
        keep = lambda r: r.get("Fiscode") in codes
        tag = "codes:" + hashlib.sha1(",".join(sorted(codes)).encode()).hexdigest()[:12]
    else:
        athletes = None  # decided by the latest list below
        keep = lambda r: r.get("Nationcode") == args.nation
        tag = "nation:" + args.nation

    # --- points lists
    lists = get_points_lists(f, since)
    latest_id = max(l["listid"] for l in lists)
    print(f"{len(lists)} points lists ({lists[0]['list_name']} .. {lists[-1]['list_name']})")
    by_list = list(pool.map(lambda l: get_list_rows(f, l, keep, tag, l["listid"] == latest_id), lists))
    latest_rows = by_list[[l["listid"] for l in lists].index(latest_id)]
    if athletes is None:
        athletes = [{"fis_code": r["Fiscode"], "first_name": r["Firstname"], "last_name": r["Lastname"]}
                    for r in latest_rows.values()]
    print(f"{len(athletes)} athletes, since {since}")

    profiles, long_rows, wide_rows = {}, [], []
    jobs = [(lst, rows.get(a["fis_code"])) for lst, rows in zip(lists, by_list) for a in athletes]
    for lst, row in jobs:
        if not row:
            continue
        code = row["Fiscode"]
        profiles[code] = {  # later lists overwrite, leaving the latest profile
            "fis_code": code, "competitor_id": row["Competitorid"],
            "last_name": row["Lastname"], "first_name": row["Firstname"],
            "nation": row["Nationcode"], "gender": row["Gender"],
            "birthdate": row["Birthdate"], "club": row["Skiclub"],
        }
        base = {"fis_code": code, "name": f'{row["Firstname"]} {row["Lastname"].title()}',
                "listid": lst["listid"], "list_name": lst["list_name"], "season": lst["season"],
                "valid_from": lst["valid_from"], "valid_to": lst["valid_to"],
                "calculation_date": row.get("Calculationdate", "")}
        wide = dict(base)
        for d in DISCIPLINES:
            pts, pos, flag = row.get(f"{d}points", ""), row.get(f"{d}pos", ""), row.get(f"{d}Sta", "")
            wide.update({f"{d}_points": pts, f"{d}_rank": pos, f"{d}_flag": flag})
            if pts:
                long_rows.append({**base, "discipline": d, "points": to_float(pts),
                                  "rank": int(pos) if pos.isdigit() else None, "flag": flag})
        wide_rows.append(wide)

    missing = [a["fis_code"] for a in athletes if a["fis_code"] not in profiles]
    if missing:
        print(f"  WARNING: not found on any points list: {missing}", file=sys.stderr)

    # --- results
    bios = list(pool.map(lambda a: get_bio_results(f, a["fis_code"], True), athletes))
    results = []
    for ath, res in zip(athletes, bios):
        p = profiles.get(ath["fis_code"], {})
        name = f'{p.get("first_name", ath["first_name"])} {p.get("last_name", ath["last_name"]).title()}'
        results += [{"fis_code": ath["fis_code"], "name": name, **r}
                    for r in res if r["date"] and r["date"] >= since]
    print(f"{len(results)} results since {since}")

    if not args.no_race_details:
        race_dates = {r["raceid"]: r["date"] for r in results}
        raceids = sorted(race_dates)
        fresh_from = date.fromordinal(today.toordinal() - args.fresh_days)
        print(f"fetching {len(raceids)} race pages")
        htmls = pool.map(lambda rid: f.get(RACE_URL, {"sectorcode": "AL", "raceid": rid},
                                           cache=race_dates[rid] < fresh_from), raceids)
        races = {}
        for rid, html in zip(raceids, htmls):
            try:
                races[rid] = parse_race(html)
            except Exception as e:  # odd formats (team events, cancelled races)
                print(f"  could not parse race {rid}: {e}", file=sys.stderr)
        for r in results:
            if r["raceid"] in races:
                r.update(race_extras(races[r["raceid"]], r["fis_code"]))
    results.sort(key=lambda r: (r["fis_code"], r["date"], r["raceid"]))

    # --- write
    write_csv(out / "athletes.csv", list(profiles.values()))
    write_csv(out / "points_lists.csv", lists)
    write_csv(out / "points_timeseries.csv", long_rows)
    write_csv(out / "points_timeseries_wide.csv", wide_rows)
    write_csv(out / "results.csv", results)
    latest = next(l for l in lists if l["listid"] == latest_id)
    write_csv(out / "latest_list.csv", [
        {"listid": latest_id, "list_name": latest["list_name"], "valid_from": latest["valid_from"],
         **{k: r.get(k, "") for k in ("Fiscode", "Lastname", "Firstname", "Nationcode", "Gender",
                                      "Birthyear", "Birthdate", "Skiclub", "Status")},
         **{f"{d}{s}": r.get(f"{d}{s}", "") for d in DISCIPLINES for s in ("points", "pos", "Sta")}}
        for r in latest_rows.values()])
    print(f"done: {f.fetched} fetched, {f.hits} from cache")


if __name__ == "__main__":
    main()

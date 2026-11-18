"""Sanity-check freshly scraped FIS data before it is committed and deployed.

Usage: python scripts/check_data.py --new DIR [--prev DIR]

Exits 1 (printing one line per problem) if the new data looks broken or has
shrunk suspiciously compared with the previous data; otherwise exits 0.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

MIN_ATHLETE_RATIO = 0.8
MIN_RESULTS_RATIO = 0.9
FILES = ("athletes.csv", "points_lists.csv", "results.csv")


def _rows(path: Path) -> list[dict] | None:
    """Return the data rows of a CSV, or None if the file does not exist."""
    if not path.is_file():
        return None
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _max_listid(rows: list[dict]) -> int | None:
    ids = [int(r["listid"]) for r in rows if (r.get("listid") or "").strip().isdigit()]
    return max(ids) if ids else None


def check(prev_dir: Path | None, new_dir: Path) -> list[str]:
    failures: list[str] = []
    new = {name: _rows(Path(new_dir) / name) for name in FILES}
    prev = {name: (_rows(Path(prev_dir) / name) if prev_dir else None) for name in FILES}

    for name, rows in new.items():
        if rows is None:
            failures.append(f"{name}: missing from {new_dir}")
        elif not rows:
            failures.append(f"{name}: has no data rows")

    def comparable(name: str) -> bool:
        return bool(new[name]) and bool(prev[name])

    if comparable("athletes.csv"):
        n, p = len(new["athletes.csv"]), len(prev["athletes.csv"])
        if n < MIN_ATHLETE_RATIO * p:
            failures.append(
                f"athletes dropped from {p} to {n} (below {MIN_ATHLETE_RATIO:.0%} of previous)"
            )

    if comparable("points_lists.csv"):
        n, p = _max_listid(new["points_lists.csv"]), _max_listid(prev["points_lists.csv"])
        if p is not None and (n is None or n < p):
            failures.append(f"latest points list went backwards from {p} to {n}")

    if comparable("results.csv"):
        n, p = len(new["results.csv"]), len(prev["results.csv"])
        if n < MIN_RESULTS_RATIO * p:
            failures.append(
                f"results dropped from {p} to {n} rows (below {MIN_RESULTS_RATIO:.0%} of previous)"
            )

    return failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--new", required=True, type=Path, help="directory with the new CSVs")
    parser.add_argument("--prev", type=Path, help="directory with the previous CSVs")
    args = parser.parse_args(argv)

    failures = check(args.prev, args.new)
    if failures:
        for f in failures:
            print(f"data check FAILED: {f}")
        return 1

    athletes = _rows(args.new / "athletes.csv") or []
    results = _rows(args.new / "results.csv") or []
    latest = _max_listid(_rows(args.new / "points_lists.csv") or [])
    print(f"data check ok: {len(athletes)} athletes, {len(results)} results, latest list {latest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/bin/sh
# Fetch the latest FIS data for all Icelandic athletes and rebuild the dashboard.
# Then open app/index.html in a browser.
set -e
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
.venv/bin/python fis_scraper.py "$@"
.venv/bin/python build_data.py
echo "open app/index.html"

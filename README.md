# Icelandic Alpine Ski Racer Dashboard

A static HTML dashboard for following Icelandic alpine ski racers through the season. FIS's own website is hard to navigate, so this app scrapes the public FIS pages and gives you one place to see rankings, athlete analytics, head-to-head comparisons and a feed of the latest results.

The interface is in Icelandic. It runs straight from disk (`file://`), so you don't need a web server.

## Quick start

```sh
./refresh.sh          # scrape FIS and rebuild app/data.js
open app/index.html   # view the dashboard
```

The first time you run `refresh.sh`, it creates `.venv` and installs the dependencies from `requirements.txt` (`requests`, `beautifulsoup4`, `lxml`). Any arguments you give it are passed on to `fis_scraper.py`, for example `./refresh.sh --refresh`.

## What the app shows

| View | Route | Contents |
|---|---|---|
| Athletes (men / women) | `#/`, `#/konur` | One table per gender. It lists every active Icelandic athlete with birth year and their FIS points and world rank in SL, GS, SG and DH. |
| Athlete profile | `#/a/<fiscode>` | An analytical profile with points history, recent races and the four factors described below. |
| Comparison | `#/c/<fiscode>,<fiscode>,…` | Several athletes side by side in the same report. You start it from a profile with **Bera saman við…** (Compare with…). |
| Latest results | `#/feed` | The newest results of Icelandic athletes with date, place, country, discipline, rank and FIS points. Click a race to open it on fis-ski.com. |

### The four factors

`app/metrics.js` measures each athlete over two periods: all seasons in the data, and the last two seasons. It also ranks the athlete within the group being viewed.

- **Stability**: the share of starts that end in a finish. DNQ starts are left out. DNF and DSQ are counted, along with how many of them happened in run 1.
- **Consistency**: the spread of FIS points across finishes (quartiles, IQR and the share of results within 10 points of the median).
- **Progression**: how much the athlete's points level improved from the start of the period to the latest list.
- **Success**: best world rank per discipline, wins, podiums, number of international starts and best international result.

## How it works

```
fis-ski.com ──► fis_scraper.py ──► data/*.csv ──► build_data.py ──► app/data.js ──► app/index.html
                     │
                     └── data/cache/  (raw responses, so reruns only fetch what changed)
```

### 1. `fis_scraper.py`: scrape FIS

By default it follows every athlete of nation `ISL` on the latest FIS points list and fetches:

- every points list since the start of the season five years ago, filtered server-side by FIS code
- each athlete's results from their biography page
- each race's full results page, for run times, field size, winner and similar details

Requests are rate-limited, retried and cached in `data/cache/`. Race pages from the last 14 days are fetched again on every run because FIS corrects results after a race.

| Option | Default | Meaning |
|---|---|---|
| `--nation` | `ISL` | Follow every athlete of this nation on the latest list |
| `--athletes FILE` | | JSON file with `{"athletes": [{"fis_code": …}]}`. Used instead of `--nation` |
| `--since YYYY-MM-DD` | 5 seasons back | How far back to fetch |
| `--fresh-days N` | `14` | Fetch race pages this recent again |
| `--out DIR` | `data` | Output directory |
| `--delay S` | `0.4` | Seconds between requests |
| `--workers N` | `4` | Number of parallel fetchers |
| `--refresh` | | Ignore the cache completely |
| `--no-race-details` | | Skip the individual race pages (faster, fewer details) |

Output in `data/`:

| File | Contents |
|---|---|
| `athletes.csv` | Athletes being followed (FIS code, name, gender, birthdate, club) |
| `points_lists.csv` | Points lists in the period and the dates they were valid |
| `latest_list.csv` | Rows from the latest points list |
| `points_timeseries.csv` | Points and rank per athlete, list and discipline (long format) |
| `points_timeseries_wide.csv` | The same data with one row per athlete and list |
| `results.csv` | One row per race start, with race details |

### 2. `build_data.py`: build the app data

Reads `data/*.csv` and writes `app/data.js` as `window.D = {…}`. Along the way it:

- restores Icelandic characters in names and clubs from `names_is.json` (for example `Sigurdsson` → `Sigurðsson`), since FIS strips them
- leaves out training races (`TRA`), which don't give FIS points
- keeps the 150 most recent results for the feed

```sh
.venv/bin/python build_data.py [--data data] [--names names_is.json] [--out app/data.js]
```

If a name still shows up without its Icelandic characters, add it to `names_is.json` and run `build_data.py` again.

### 3. `app/`: the dashboard

Plain HTML, CSS and JavaScript with no build step and no dependencies.

| File | Role |
|---|---|
| `index.html` | Page shell |
| `app.js` | Hash router and the views (tables, profile, comparison, feed) |
| `charts.js` | The analytical report and its SVG charts |
| `metrics.js` | The four factors (also loadable from Node) |
| `style.css` | Styles that follow `STYLE.md` |
| `data.js` | Generated by `build_data.py`. Don't edit it by hand |

## Tests

```sh
node tests/test_metrics.js
```

This checks the metrics computed by `app/metrics.js` against the reference values in `comparison_is.html`, the original comparison report that the profile and comparison views are based on.

## Other files

- `specs.md`: goals and requirements for the app
- `STYLE.md`: the visual style guide shared with the team's other reports
- `comparison_is.html`: the original static comparison report, used as the reference for the metrics test
- `scandi_races_2025/`: a separate analysis that uses the same scraper. It collects men's races in Scandinavia (Nov–Dec 2025), recomputes each race's real penalty when FIS has raised it to the category minimum (`penalty.py`), and ranks races by how favourable they were for first-year athletes to score points (`ranking.py`). Run it from inside that folder with `../.venv/bin/python scrape_races.py --help`.

## Deployment

The dashboard is served by GitHub Pages straight from `app/`. Publishing is done by the workflow in `.github/workflows/refresh.yml`.

**Schedule.** The workflow scrapes FIS and rebuilds the data every day at 22:00 UTC from October to April, and on Mondays at 22:00 UTC from May to September. You can also start it at any time from the Actions tab ("Refresh data and deploy" → **Run workflow**) or with `gh workflow run refresh.yml`. A push to `main` skips the scrape and only redeploys the site.

**Where things live.** The CSVs in `data/` and `app/data.js` are committed to the repo. When a refresh changes them, `github-actions[bot]` commits them as `data: refresh YYYY-MM-DD`. The scrape cache (`data/cache/`) is not committed. It lives in the Actions cache, and GitHub evicts it after 7 days without use. Without the cache the next run downloads everything again, which takes about 10–15 minutes.

**Checks that block a bad refresh.** Before committing, the workflow runs `scripts/check_data.py` against the previous commit's data, then `node tests/test_metrics.js`. The run fails if:

- any of `athletes.csv`, `points_lists.csv` or `results.csv` is missing or has no data rows
- the number of athletes falls below 80% of the previous count
- the newest points list id goes down
- the number of result rows falls below 90% of the previous count
- the metrics test fails

A failed run commits nothing and deploys nothing, so the site keeps its last good data. GitHub emails the repo owner about the failed run.

**If FIS blocks GitHub's runners** (the scrape fails with repeated 403/429 retries), refresh locally and push:

```sh
./refresh.sh
git add data/*.csv app/data.js && git commit -m "data: local refresh" && git push
```

The push deploys the new data without scraping.

**Running the check yourself:**

```sh
.venv/bin/python scripts/check_data.py --new data --prev path/to/previous/data
.venv/bin/python -m unittest tests/test_check_data.py
```

## Data source

All data comes from public pages on [fis-ski.com](https://www.fis-ski.com). The scraper spaces out its requests and caches responses, so please keep the delay reasonable.

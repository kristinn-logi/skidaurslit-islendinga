# Design: GitHub Actions scrapes + GitHub Pages hosting

Date: 2026-11-18 · Status: approved

## Intent

Put the Icelandic alpine racer dashboard on the web and keep its data fresh without anyone running `refresh.sh` by hand. The page may be public. The FIS data it shows is public anyway.

This document and the plan are written in one Claude account. Another account will carry them out, so everything needed has to be in the documents.

## Goals

- The dashboard (`app/`) is served by GitHub Pages.
- A scheduled GitHub Actions workflow scrapes FIS, rebuilds `app/data.js`, commits the data and publishes the site.
- A bad scrape (for example after FIS changes its pages) never replaces good data on the site.

## Non-goals

- No database, server or serverless functions.
- No login or access control.
- No changes to the scraper's logic or the app's features.
- `scandi_races_2025/` is not deployed and not scheduled. It is only kept in the repo.

## Constraints

- `data/cache/` is 531 MB (about 1,437 raw pages), too large for Git. It is only a speed-up: losing it means one slow run, not lost data.
- GitHub Pages can only serve a branch's root or `/docs`, so `app/` has to be published with the Actions Pages deployment (`actions/upload-pages-artifact` + `actions/deploy-pages`).
- A commit pushed with `GITHUB_TOKEN` does not start other workflows, so publishing has to happen in the same workflow as the scrape.
- GitHub never overwrites an existing `actions/cache` key, so each run saves under a new key (containing the run id) and restores by prefix.
- Cron runs in UTC, which is also Iceland's time all year.
- FIS may block or rate-limit GitHub's IP ranges. This can only be verified with a live run.

## Approaches

1. **One workflow: scrape → check → commit → publish (chosen).** Nothing in the project has to move, and publishing doesn't depend on one workflow triggering another.
2. Commit the data, then let Pages publish from the branch. This needs the app moved to `/docs` or the repo root, plus a workaround because a workflow's own commits don't trigger the Pages build. More change for no gain.
3. Vercel. Ruled out: the user chose GitHub Pages.

## Decided

- **Triggers:**
  - Daily at 22:00 UTC from October to April.
  - Mondays at 22:00 UTC from May to September.
  - `workflow_dispatch` (manual run).
  - Pushes to `main` that change code, which publish without scraping.
  - A concurrency group so two runs never overlap.
- **Data storage:** `data/*.csv` and `app/data.js` are committed to the repo. Commit only when something changed, as `github-actions[bot]`. `data/cache/` lives in `actions/cache`.
- **Sanity checks before committing,** comparing against the last committed data:
  - The athlete count is at least 80% of the previous count.
  - The newest points list id has not gone down.
  - The number of result rows is at least 90% of the previous number.
  - `node tests/test_metrics.js` passes.

  If any check fails, the job fails and nothing is committed or published. GitHub emails the repo owner about the failed run.
- **Files added:**
  - `.gitignore`
  - `.github/workflows/refresh.yml`
  - `scripts/check_data.py`
  - A "Deployment" section in `README.md`
- **Manual steps for the operator:**
  1. Create a public GitHub repo and push.
  2. Set Settings → Pages → Source to "GitHub Actions".
  3. Start the first run manually. Expect it to take 10–15 minutes because the cache starts empty.
- **Fallback if FIS blocks GitHub:** scrape locally with `./refresh.sh`, then commit and push. The push publishes the site without scraping.

## Left to the builder

- Exact action versions. Use the current major versions.
- The Python version (3.12 is fine) and the Node version (20 is fine).
- The exact wording of the README section.

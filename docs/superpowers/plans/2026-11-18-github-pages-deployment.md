# GitHub Actions + GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the dashboard in `app/` on GitHub Pages. A scheduled GitHub Actions workflow scrapes FIS, checks the new data, commits it and publishes the site.

**Architecture:** A single workflow, `.github/workflows/refresh.yml`, has two jobs. The `refresh` job restores the scrape cache, runs `fis_scraper.py` and `build_data.py`, gates on `scripts/check_data.py` and the metrics test, commits `data/*.csv` and `app/data.js`, and saves the cache. The `deploy` job uploads `app/` and publishes it with the Pages actions. Pushes to `main` skip the scrape and only deploy.

**Tech Stack:** GitHub Actions, GitHub Pages (Actions source), Python 3.13 (`requests`, `beautifulsoup4`, `lxml`), Node 22 (test only), the stdlib `unittest` module.

**Spec:** `docs/superpowers/specs/2026-11-18-github-pages-deployment-design.md`

**Context for the executor:** The project folder is **not yet a git repository**. Task 1 creates it. Nothing has been pushed anywhere. A human operator creates the GitHub repo and changes repo settings in Task 5. Read `README.md` for how the scraper → CSV → `app/data.js` pipeline works.

## Global Constraints

- The page is public. Use a **public** GitHub repo, because Pages from a private repo needs a paid plan.
- Do not change the scraper's logic or the app's features. The only edits to existing files are `README.md` (Task 4).
- Never commit `data/cache/` (531 MB) or `scandi_races_2025/data/cache/` (36 MB).
- Schedules: daily at 22:00 UTC in Oct–Apr, Mondays at 22:00 UTC in May–Sep, plus `workflow_dispatch`.
- Check thresholds:
  - The new athlete count must be at least **80%** of the previous count.
  - The newest points list id must not go down.
  - The number of result rows must be at least **90%** of the previous number.
  - `node tests/test_metrics.js` must pass.
- When a check fails, the job fails and nothing is committed or deployed.
- Commit data only when something changed. The commit author is `github-actions[bot]`.
- Runs never overlap (a concurrency group).

## Review Focus

1. **FIS blocks or rate-limits GitHub's runners** (403/429 on every request). `Fetcher.get` retries 5 times and then raises, so the scraper exits non-zero and the job fails before committing. The site keeps its old data. Checked in Task 5, Step 6.
2. **A scrape "succeeds" but writes header-only CSVs** (for example after FIS changes its page layout). The check must fail even when there is no previous data to compare with. Pinned in Task 2 by `test_fails_when_new_file_has_no_rows` and `test_without_prev_still_requires_rows`.
3. **The deploy job checks out the commit that triggered the run, not the bot's new data commit,** so the site would show yesterday's data. Deploy must check out `ref: main`. Checked in Task 5, Step 5 (the site's `data.js` has today's `built` date).
4. **The owner pushes code locally while a scheduled run is in progress,** so the bot's `git push` is rejected as non-fast-forward. Run `git pull --rebase` before `git push` (Task 3).
5. **The cache is missing** (first run, or GitHub evicted it after 7 days without use, typically in the off-season). A full download is about 1,437 pages and takes roughly 10–15 minutes. `timeout-minutes: 90` leaves room. The duration is recorded in Task 5, Step 4.

---

### Task 1: Initialise the repository with a .gitignore

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Produces: a git repo on branch `main` with one commit containing the project minus ignored paths. Task 3's workflow relies on `data/*.csv` and `app/data.js` being tracked, because `git show HEAD:data/...` is used as the "previous" data.

- [ ] **Step 1: Write `.gitignore`** with exactly these entries: `.venv/`, `__pycache__/`, `.DS_Store`, `data/cache/`, `scandi_races_2025/data/cache/`.

- [ ] **Step 2: Initialise and check what would be tracked**

Run: `git init -b main && git add -A && git status --short | grep -E 'cache/|\.venv|__pycache__|DS_Store' ; git ls-files | tr '\n' '\0' | xargs -0 du -ch | tail -1`
Expected: the `grep` prints nothing, and the total is under 10M (around 7M: the CSVs, `app/data.js` at 1.6M and `comparison_is.html`).

- [ ] **Step 3: Confirm the files the tests need are tracked**

Run: `git ls-files comparison_is.html tests/test_metrics.js app/data.js data/athletes.csv data/points_lists.csv data/results.csv`
Expected: all six paths are listed.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: initial import of FIS dashboard"
```

---

### Task 2: Data sanity check (`scripts/check_data.py`)

**Files:**
- Create: `scripts/check_data.py`
- Test: `tests/test_check_data.py`

**Interfaces:**
- Produces:
  - `check(prev_dir: Path | None, new_dir: Path) -> list[str]` returns one human-readable message per failed rule, and an empty list means OK.
  - `main(argv: list[str] | None = None) -> int` is the CLI: `python scripts/check_data.py --new DIR [--prev DIR]`. It prints each failure and returns 1 if there are any, otherwise prints `data check ok: <n> athletes, <n> results, latest list <id>` and returns 0.
  - Constants: `MIN_ATHLETE_RATIO = 0.8`, `MIN_RESULTS_RATIO = 0.9`, `FILES = ("athletes.csv", "points_lists.csv", "results.csv")`.
- Rules:
  1. Each file in `FILES` must exist in `new_dir` with at least one data row.
  2. If `prev_dir` is given and contains that file with rows, then:
     - `new athletes rows >= 0.8 * prev athletes rows`
     - `max(int(listid)) in new points_lists >= max in prev`
     - `new results rows >= 0.9 * prev results rows`

  A missing `prev_dir` or missing prev file skips the comparison rules only.
- Tests import the module with `sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))`. They build CSVs in a `tempfile.TemporaryDirectory()` with a helper `write(dir, name, header, n_rows)`. Use the real headers: `athletes.csv` → `fis_code,...`; `points_lists.csv` → `listid,season,list_name,valid_from,valid_to`; `results.csv` → any header works.

- [ ] **Step 1: Write the failing tests** in `tests/test_check_data.py` (`unittest.TestCase`):
  - `test_passes_when_unchanged`: prev and new both have 84 athletes, lists with max listid 473 and 3715 results. `check(...) == []`.
  - `test_athlete_drop_threshold`: prev has 84. New with 68 passes (68 ≥ 67.2). New with 67 fails, and the message contains `"athletes"`.
  - `test_fails_when_latest_list_goes_backwards`: prev max listid is 473 and new is 472. The message contains `"points list"`.
  - `test_results_drop_threshold`: prev has 1000. New with 900 passes. New with 899 fails, and the message contains `"results"`.
  - `test_fails_when_new_file_has_no_rows`: new `results.csv` has only its header. The message contains `"results.csv"`.
  - `test_without_prev_still_requires_rows`: `check(None, new)` with a header-only `athletes.csv` returns one failure. `check(None, valid_new) == []`.
  - `test_main_exit_codes`: `main(["--new", good])` returns 0, and `main(["--new", bad, "--prev", prev])` returns 1.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m unittest tests/test_check_data.py -v`
Expected: an ERROR with `ModuleNotFoundError: No module named 'check_data'`.

- [ ] **Step 3: Implement `check` and `main` in `scripts/check_data.py`.** Use `csv.DictReader`, as `build_data.py` does, and `argparse`. Add the standard `if __name__ == "__main__": sys.exit(main())`.

- [ ] **Step 4: Run the tests to verify they pass, then run the CLI on the real data**

Run: `.venv/bin/python -m unittest tests/test_check_data.py -v && .venv/bin/python scripts/check_data.py --new data --prev data`
Expected: all 7 tests pass, then `data check ok: 84 athletes, 3715 results, latest list 473` (the numbers match the current `data/`).

- [ ] **Step 5: Commit**

```bash
git add scripts/check_data.py tests/test_check_data.py
git commit -m "feat: add data sanity check for scheduled refreshes"
```

---

### Task 3: Workflow `.github/workflows/refresh.yml`

**Files:**
- Create: `.github/workflows/refresh.yml`

**Interfaces:**
- Consumes: `scripts/check_data.py --new DIR --prev DIR` (Task 2) and the tracked data (Task 1).
- Produces: the deploy job publishes `app/` to the `github-pages` environment, which Task 5 verifies.

- [ ] **Step 1: Write the workflow** with these exact values:
  - **`name`:** `Refresh data and deploy`.
  - **`on`:**
    - `schedule`: `cron: "0 22 * 1-4,10-12 *"` and `cron: "0 22 * 5-9 1"`.
    - `workflow_dispatch: {}`.
    - `push` on `branches: [main]` with `paths-ignore: ["docs/**", "**.md"]`. A local fallback push of data must still deploy, so do not ignore `data/**` or `app/data.js`.
  - **`permissions`:** `contents: write`, `pages: write`, `id-token: write`.
  - **`concurrency`:** `group: refresh-and-deploy`, `cancel-in-progress: false`.
  - **Job `refresh`:** `if: github.event_name != 'push'`, `runs-on: ubuntu-latest`, `timeout-minutes: 90`. Steps in order:
    1. `actions/checkout@v4`.
    2. `actions/setup-python@v5` with `python-version: "3.13"` and `cache: pip`. Then `pip install -r requirements.txt`.
    3. `actions/setup-node@v4` with `node-version: "22"`.
    4. `python -m unittest tests/test_check_data.py`.
    5. `actions/cache/restore@v4` with `path: data/cache`, `key: fis-cache-${{ github.run_id }}`, `restore-keys: fis-cache-`.
    6. Copy the previous data: `mkdir -p "$RUNNER_TEMP/prev" && for f in athletes points_lists results; do git show HEAD:data/$f.csv > "$RUNNER_TEMP/prev/$f.csv"; done`.
    7. `python fis_scraper.py`, then `python build_data.py`.
    8. `python scripts/check_data.py --new data --prev "$RUNNER_TEMP/prev"`, then `node tests/test_metrics.js`.
    9. Commit if changed. Set the identity to `github-actions[bot]` / `41898282+github-actions[bot]@users.noreply.github.com`, then run `git add data/*.csv app/data.js` and `git diff --cached --quiet || { git commit -m "data: refresh $(date -u +%F)" && git pull --rebase origin main && git push origin HEAD:main; }`.
    10. `actions/cache/save@v4` with `if: always()`, `path: data/cache` and `key: fis-cache-${{ github.run_id }}`. Saving after a failed check is intended, because the raw pages are still valid and make a retry faster.
  - **Job `deploy`:**
    - `needs: refresh`.
    - `if: always() && (needs.refresh.result == 'success' || needs.refresh.result == 'skipped')`.
    - `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`.
    - Steps:
      1. `actions/checkout@v4` with **`ref: main`**.
      2. `actions/configure-pages@v5`.
      3. `actions/upload-pages-artifact@v3` with `path: app`.
      4. `actions/deploy-pages@v4` with `id: deployment`.

- [ ] **Step 2: Lint the workflow**

Run: `brew install actionlint 2>/dev/null; actionlint .github/workflows/refresh.yml`
Expected: no output and exit code 0.

- [ ] **Step 3: Check the schedules mean what the spec says**

Run: `grep -n 'cron' .github/workflows/refresh.yml`
Expected: exactly the two cron lines from Step 1. The second one ends in `1`, meaning Monday.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/refresh.yml
git commit -m "ci: scheduled FIS refresh and GitHub Pages deploy"
```

---

### Task 4: README "Deployment" section

**Files:**
- Modify: `README.md`: add a `## Deployment` section before `## Data source`.

- [ ] **Step 1: Write the section.** It must cover:
  - The site is served by GitHub Pages from `app/` through `.github/workflows/refresh.yml`.
  - The schedule: daily at 22:00 UTC in Oct–Apr, Mondays in May–Sep, plus the manual "Run workflow" button.
  - Data is committed to the repo, and the cache lives in Actions cache.
  - The checks that block a bad refresh, and that a failed run leaves the site unchanged and emails the repo owner.
  - Fallback if FIS blocks GitHub: run `./refresh.sh` locally, then `git add data/*.csv app/data.js && git commit && git push`. The push deploys without scraping.
  - `scripts/check_data.py` usage and the new test command, `.venv/bin/python -m unittest tests/test_check_data.py`.

- [ ] **Step 2: Verify**

Run: `grep -n '^## ' README.md`
Expected: `## Deployment` appears directly before `## Data source`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe deployment and scheduled refresh"
```

---

### Task 5: Go live (operator steps on GitHub)

Steps 1–2 need the human operator's GitHub account. The executing agent should ask the operator to do them, or do them with `gh` if it is authenticated as the operator.

- [ ] **Step 1: Create a public repo and push.**
  Run: `gh repo create <owner>/<name> --public --source . --push` (or create it in the web UI, then `git remote add origin … && git push -u origin main`).
  Expected: the push succeeds. A workflow run starts from the push and only the `deploy` job runs. It may fail until Step 2 is done, which is fine.

- [ ] **Step 2: Enable Pages:** go to Settings → Pages → Build and deployment → Source: **GitHub Actions**.

- [ ] **Step 3: Start the first full run:** `gh workflow run refresh.yml`, or Actions → "Refresh data and deploy" → Run workflow.

- [ ] **Step 4: Watch it:** `gh run watch`.
  Expected: both jobs pass. Note the `refresh` duration, which will be around 10–15 minutes on a cold cache. The log shows `data check ok: …` and either a `data: refresh YYYY-MM-DD` commit or no commit if nothing changed.

- [ ] **Step 5: Verify the live site serves fresh data**
  Run: `curl -s https://<owner>.github.io/<name>/data.js | grep -o '"built": *"[0-9-]*"'`
  Expected: the date of the run (UTC). Also open `https://<owner>.github.io/<name>/#/feed` and confirm the feed shows the **Bæting** column and recent races.

- [ ] **Step 6: If the refresh job failed in `fis_scraper.py`** with repeated `retry … 403`/`429` lines, FIS is blocking GitHub's runners. Don't change the scraper. Tell the operator and point them to the README fallback (scrape locally, then push). Expected: the site from the push-triggered deploy still works.

- [ ] **Step 7: Run it a second time** with `gh workflow run refresh.yml`.
  Expected: the log shows a cache restore (`Cache restored from key: fis-cache-…`), most pages come from the cache (`done: N fetched, M from cache`, with M much larger than N), and the run is much faster.

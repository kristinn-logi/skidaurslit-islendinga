import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from check_data import check, main  # noqa: E402

ATHLETES_HEADER = "fis_code,competitor_id,last_name,first_name,nation,gender,birthdate,club"
LISTS_HEADER = "listid,season,list_name,valid_from,valid_to"
RESULTS_HEADER = "fis_code,date,raceid"


def write(dir, name, header, n_rows, start=1):
    """Write a CSV with `n_rows` data rows. For points_lists.csv the listid
    column runs start..start+n_rows-1, so the max listid is start+n_rows-1."""
    cols = header.split(",")
    lines = [header]
    for i in range(n_rows):
        lines.append(",".join([str(start + i)] + ["x"] * (len(cols) - 1)))
    Path(dir, name).write_text("\n".join(lines) + "\n", encoding="utf-8")


def make(dir, athletes=84, max_list=473, results=3715):
    write(dir, "athletes.csv", ATHLETES_HEADER, athletes)
    write(dir, "points_lists.csv", LISTS_HEADER, 10, start=max_list - 9)
    write(dir, "results.csv", RESULTS_HEADER, results)


class CheckDataTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.prev = root / "prev"
        self.new = root / "new"
        self.prev.mkdir()
        self.new.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def test_passes_when_unchanged(self):
        make(self.prev)
        make(self.new)
        self.assertEqual(check(self.prev, self.new), [])

    def test_athlete_drop_threshold(self):
        make(self.prev, athletes=84)
        make(self.new, athletes=68)
        self.assertEqual(check(self.prev, self.new), [])
        make(self.new, athletes=67)
        failures = check(self.prev, self.new)
        self.assertEqual(len(failures), 1)
        self.assertIn("athletes", failures[0])

    def test_fails_when_latest_list_goes_backwards(self):
        make(self.prev, max_list=473)
        make(self.new, max_list=472)
        failures = check(self.prev, self.new)
        self.assertEqual(len(failures), 1)
        self.assertIn("points list", failures[0])

    def test_results_drop_threshold(self):
        make(self.prev, results=1000)
        make(self.new, results=900)
        self.assertEqual(check(self.prev, self.new), [])
        make(self.new, results=899)
        failures = check(self.prev, self.new)
        self.assertEqual(len(failures), 1)
        self.assertIn("results", failures[0])

    def test_fails_when_new_file_has_no_rows(self):
        make(self.prev)
        make(self.new)
        write(self.new, "results.csv", RESULTS_HEADER, 0)
        failures = check(self.prev, self.new)
        self.assertTrue(failures)
        self.assertTrue(any("results.csv" in f for f in failures))

    def test_without_prev_still_requires_rows(self):
        make(self.new)
        self.assertEqual(check(None, self.new), [])
        write(self.new, "athletes.csv", ATHLETES_HEADER, 0)
        failures = check(None, self.new)
        self.assertEqual(len(failures), 1)
        self.assertIn("athletes.csv", failures[0])

    def test_main_exit_codes(self):
        make(self.prev, athletes=84)
        make(self.new)
        self.assertEqual(main(["--new", str(self.new)]), 0)
        bad = Path(self._tmp.name) / "bad"
        bad.mkdir()
        make(bad, athletes=10)
        self.assertEqual(main(["--new", str(bad), "--prev", str(self.prev)]), 1)


if __name__ == "__main__":
    unittest.main()

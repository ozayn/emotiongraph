#!/usr/bin/env python3
"""
Import tracker data into the Test user (test@emotiongraph.local) only.

Default: read ``emotiongraph_test_csvs.zip`` from ``sample_data/`` at the repo root (sibling of
``backend/``). That zip may contain many ``YYYY-MM-DD.csv`` files (one calendar day per file). If the
preferred zip is missing but exactly one other ``*.zip`` exists in ``sample_data/``, that file is
used.

Usage (from ``backend/`` with venv active):

  .venv/bin/python scripts/import_test_tracker_csv.py

  .venv/bin/python scripts/import_test_tracker_csv.py --zip ../sample_data/other-export.zip
  .venv/bin/python scripts/import_test_tracker_csv.py --csv ../sample_data/test_tracker_import.csv
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent
SAMPLE_DATA_DIR = PROJECT_ROOT / "sample_data"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

PREFERRED_ZIP_NAME = "emotiongraph_test_csvs.zip"
DEFAULT_CSV_SAMPLE = SAMPLE_DATA_DIR / "test_tracker_import.csv"


def _default_zip() -> Path:
    preferred = SAMPLE_DATA_DIR / PREFERRED_ZIP_NAME
    if preferred.is_file():
        return preferred

    zips = sorted(SAMPLE_DATA_DIR.glob("*.zip"))
    if not zips:
        raise FileNotFoundError(
            f"No *.zip in {SAMPLE_DATA_DIR}. Add {PREFERRED_ZIP_NAME} there (or another .zip), "
            "or pass --zip PATH / --csv PATH."
        )
    if len(zips) == 1:
        return zips[0]
    names = ", ".join(z.name for z in zips)
    raise ValueError(
        f"Multiple *.zip files in {SAMPLE_DATA_DIR} ({names}). "
        f"Add {PREFERRED_ZIP_NAME} or pass --zip PATH."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import tracker CSV (from zip or file) for the Test user only.")
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--zip", metavar="PATH", help="Zip archive containing a .csv file")
    src.add_argument(
        "--csv",
        metavar="PATH",
        help=f"Plain CSV path (committed sample: {DEFAULT_CSV_SAMPLE})",
    )
    args = parser.parse_args()

    from app.db import SessionLocal
    from app.services.test_tracker_csv_import import import_test_tracker_csv, import_test_tracker_zip

    db = SessionLocal()
    try:
        if args.csv:
            path = Path(args.csv).resolve()
            stats = import_test_tracker_csv(db, path)
            print(
                f"Imported {stats['log_entries']} log entries, {stats['tracker_days']} tracker day rows, "
                f"{stats['rows_read']} CSV rows from {stats.get('source', path.name)}"
            )
        else:
            zip_path = Path(args.zip).resolve() if args.zip else _default_zip()
            stats = import_test_tracker_zip(db, zip_path)
            members = stats.get("csv_members") or []
            files_note = f"{stats.get('csv_files', 1)} CSV file(s)"
            if len(members) <= 3:
                files_note += f": {', '.join(members)}" if members else ""
            else:
                files_note += f" (e.g. {members[0]}, … +{len(members) - 1} more)"
            print(
                f"Imported {stats['log_entries']} log entries, {stats['tracker_days']} tracker day rows, "
                f"{stats['rows_read']} CSV rows from zip {stats.get('source', zip_path.name)} ({files_note})"
            )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        db.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

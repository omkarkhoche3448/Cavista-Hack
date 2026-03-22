#!/usr/bin/env python3
"""Hard reset a Supabase PostgreSQL database by dropping all non-system schemas.

Usage:
  python backend/database/scripts/wipe_supabase.py --yes

Environment:
  Prefer setting SUPABASE_DB_URL directly.
  If missing, this script can build it from:
    - SUPABASE_URL
    - SUPABASE_DB_PASSWORD
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[3]
SQL_PATH = Path(__file__).resolve().with_name("drop_all_schemas.sql")


def _build_db_url() -> str | None:
    direct = os.getenv("SUPABASE_DB_URL")
    if direct:
        return direct

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    db_password = os.getenv("SUPABASE_DB_PASSWORD", "").strip()
    if not supabase_url or not db_password:
        return None

    host = urlparse(supabase_url).hostname or ""
    if not host:
        return None

    project_ref = host.split(".")[0]
    return f"postgresql://postgres:{db_password}@db.{project_ref}.supabase.co:5432/postgres?sslmode=require"


def _confirm(force: bool) -> None:
    if force:
        return

    print("WARNING: This will DROP ALL non-system schemas in your Supabase database.")
    print("This operation is irreversible.")
    answer = input("Type DROP_ALL_SCHEMAS to continue: ").strip()
    if answer != "DROP_ALL_SCHEMAS":
        print("Aborted.")
        sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Drop all non-system schemas from Supabase PostgreSQL.")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation prompt.")
    args = parser.parse_args()

    # Load env from root first, then backend local env if present.
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "backend" / ".env", override=False)

    db_url = _build_db_url()
    if not db_url:
        print("Missing DB connection info.")
        print("Set SUPABASE_DB_URL or both SUPABASE_URL and SUPABASE_DB_PASSWORD.")
        return 1

    if not SQL_PATH.exists():
        print(f"SQL file not found: {SQL_PATH}")
        return 1

    sql = SQL_PATH.read_text(encoding="utf-8")
    _confirm(args.yes)

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        conn.close()
        print("Supabase reset completed: all non-system schemas dropped and public recreated.")
        return 0
    except Exception as error:
        print(f"Failed to wipe database: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

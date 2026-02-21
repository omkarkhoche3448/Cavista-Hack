#!/usr/bin/env python3
"""
Smart EMR — Schema Validation & Migration Helper
Run: python validate_schema.py --dsn postgresql://user:pass@localhost/emrdb
"""
import argparse
import sys

EXPECTED_TABLES = {
    "public": [
        "users", "doctor_profiles", "patient_profiles",
        "sessions", "session_state_history", "medical_documents",
        "session_document_shares", "transcript_chunks", "final_transcripts",
        "integration_logs",
    ],
    "comms": ["ws_connections", "ws_events", "notifications"],
    "ai":    ["jobs", "prompt_templates", "pre_session_insights"],
    "emr":   [
        "icd_codes", "emr_drafts", "final_emrs", "icd_mappings",
        "treatment_suggestions", "patient_summaries", "export_logs",
    ],
    "audit": ["audit_logs"],
}

EXPECTED_INDEXES = [
    "idx_users_email", "idx_sessions_status", "idx_transcript_chunks_session_id",
    "idx_icd_codes_search_vector", "idx_icd_codes_short_desc_trgm",
    "idx_ai_jobs_status", "idx_audit_logs_phi_accessed",
]

EXPECTED_EXTENSIONS = ["uuid-ossp", "pgcrypto", "pg_trgm", "btree_gist", "unaccent"]


def validate(dsn: str) -> bool:
    """
    Validates that the target PostgreSQL database has the correct extensions, tables, and indexes.
    
    Why: Ensures the environment is correctly provisioned before running the application.
    Where: Manual execution via terminal or as part of a CI/CD deployment pipeline.
    
    Args:
        dsn (str): PostgreSQL Data Source Name (connection string).
        
    Returns:
        bool: True if all schema requirements are met.
    """
    try:
        import psycopg2
    except ImportError:
        print("❌ psycopg2 not installed. Run: pip install psycopg2-binary")
        return False

    conn = psycopg2.connect(dsn)
    cur  = conn.cursor()
    ok   = True

    # Extensions
    cur.execute("SELECT extname FROM pg_extension;")
    installed_ext = {r[0] for r in cur.fetchall()}
    for ext in EXPECTED_EXTENSIONS:
        if ext in installed_ext:
            print(f"  ✓ Extension: {ext}")
        else:
            print(f"  ✗ MISSING Extension: {ext}")
            ok = False

    # Tables
    cur.execute("""
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_type = 'BASE TABLE'
          AND table_schema IN ('public','comms','ai','emr','audit')
    """)
    existing = {(r[0], r[1]) for r in cur.fetchall()}
    for schema, tables in EXPECTED_TABLES.items():
        for tbl in tables:
            if (schema, tbl) in existing:
                print(f"  ✓ Table: {schema}.{tbl}")
            else:
                print(f"  ✗ MISSING Table: {schema}.{tbl}")
                ok = False

    # Indexes
    cur.execute("SELECT indexname FROM pg_indexes;")
    existing_idx = {r[0] for r in cur.fetchall()}
    for idx in EXPECTED_INDEXES:
        if idx in existing_idx:
            print(f"  ✓ Index: {idx}")
        else:
            print(f"  ✗ MISSING Index: {idx}")
            ok = False

    # RLS
    cur.execute("""
        SELECT tablename FROM pg_tables
        WHERE rowsecurity = TRUE
          AND schemaname IN ('public','emr','audit')
    """)
    rls_tables = {r[0] for r in cur.fetchall()}
    for tbl in ["medical_documents", "emr_drafts", "final_emrs", "audit_logs"]:
        if tbl in rls_tables:
            print(f"  ✓ RLS enabled: {tbl}")
        else:
            print(f"  ✗ RLS NOT enabled: {tbl}")
            ok = False

    cur.close()
    conn.close()
    return ok


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    args = parser.parse_args()

    print("\n=== Smart EMR Schema Validation ===\n")
    result = validate(args.dsn)
    print("\n" + ("✅ All checks passed." if result else "❌ Some checks failed."))
    sys.exit(0 if result else 1)

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

tables_to_check = [
    "users", "sessions", "medical_documents", "transcript_chunks", 
    "emr_drafts", "pre_session_insights", "patient_summaries",
    "icd_mappings", "treatment_suggestions", "final_emrs", "notifications"
]

print("Checking tables in 'public' schema:")
for table in tables_to_check:
    try:
        res = supabase.from_(table).select("*").limit(0).execute()
        print(f"  ✓ {table}: Found")
    except Exception as e:
        print(f"  ✗ {table}: Error -> {e.message if hasattr(e, 'message') else str(e)}")

print("\nChecking schemas exposed:")
# This usually fails if not superuser but worth a try or just observe error hint
try:
    res = supabase.rpc("check_schemas").execute()
    print(res.data)
except Exception as e:
    # Error message often contains hints about existing tables
    print(f"Schema check error (check hint): {e}")

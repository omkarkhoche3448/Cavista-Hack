import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")

supabase = create_client(url, key)

# Try to list tables in public
try:
    print("Tables in public schema:")
    res = supabase.rpc("get_tables").execute()
    print(res.data)
except Exception as e:
    print(f"Error getting tables: {e}")

# Try to query pre_session_insights with schema
try:
    print("\nQuerying ai.pre_session_insights:")
    res = supabase.schema("ai").from_("pre_session_insights").select("*").limit(1).execute()
    print("Success!")
except Exception as e:
    print(f"Error querying ai.pre_session_insights: {e}")

# Try to query emr.emr_drafts with schema
try:
    print("\nQuerying emr.emr_drafts:")
    res = supabase.schema("emr").from_("emr_drafts").select("*").limit(1).execute()
    print("Success!")
except Exception as e:
    print(f"Error querying emr.emr_drafts: {e}")

# Try to query emr_drafts without schema
try:
    print("\nQuerying emr_drafts (default schema):")
    res = supabase.from_("emr_drafts").select("*").limit(1).execute()
    print("Success!")
except Exception as e:
    print(f"Error querying emr_drafts (default): {e}")

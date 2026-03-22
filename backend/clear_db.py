import os
from dotenv import load_dotenv
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

schema_map = {
    "public": [
        "session_state_history",
        "transcript_chunks",
        "final_transcripts",
        "session_document_shares",
        "pre_session_insights",
        "medical_documents",
        "icd_mappings",
        "treatment_suggestions",
        "patient_summaries",
        "final_emrs",
        "emr_drafts",
        "doctor_notes",
        "notifications",
        "sessions",
    ]
}

def clear_tables():
    """
    Utility script to wipe all application data from the Supabase database.
    
    Why: Used by developers to reset the environment to a clean state during testing or hackathon iterations.
    Where: Manual execution from the terminal (python clear_db.py).
    
    Processing: Iterates through defined schemas and tables, using a 'neq' filter on ID to bypass 
    Supabase's restriction on DELETE without a WHERE clause in some configurations.
    """
    print("Starting database cleanup...")
    
    for schema, tables in schema_map.items():
        print(f"\n--- Cleaning schema: {schema} ---")
        
        try:
            # Use SyncClientOptions to specify the schema
            options = SyncClientOptions(schema=schema)
            client = create_client(url, key, options=options)
            
            for table in tables:
                try:
                    print(f"Clearing {schema}.{table}...")
                    # Delete all rows where id is not zero (common hack to select all)
                    client.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
                    print(f"Successfully cleared {table}.")
                except Exception as e:
                    # Some tables might use INT ids instead of UUID
                    if "invalid input syntax for type uuid" in str(e):
                         try:
                             client.table(table).delete().neq("id", "-1").execute()
                             print(f"Successfully cleared {table} (int id).")
                         except Exception as e2:
                             print(f"Error clearing {schema}.{table} with int id: {e2}")
                    else:
                        print(f"Error clearing {schema}.{table}: {e}")
        except Exception as e:
            print(f"Could not initialize client for schema {schema}: {e}")

    print("\nDB Cleanup finished.")

if __name__ == "__main__":
    clear_tables()

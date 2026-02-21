from supabase import create_client, Client
from .config import settings
from postgrest import SyncPostgrestClient

# Set a custom timeout for the underlying httpx client
supabase: Client = create_client(
    settings.SUPABASE_URL, 
    settings.SUPABASE_KEY
)

# Manually increase the timeout of the underlying session if possible, 
# or ensure the client is robust.
# supabase-py doesn't expose timeout directly in create_client yet in some versions,
# but we can try to wrap the call or just ensure we have good settings.


def get_supabase() -> Client:
    """
    FastAPI dependency that provides the initialized Supabase client singleton.
    
    Called by:
        - Virtually all routers (auth.py, sessions.py, documents.py, emr.py) as a Depends() dependency.
        - Internal handle_ws_event utility in sessions.py.
        
    Returns:
        supabase.Client: The shared Supabase client instance.
    """
    return supabase

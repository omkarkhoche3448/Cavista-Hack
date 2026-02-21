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
    """FastAPI dependency for Supabase client access."""
    return supabase

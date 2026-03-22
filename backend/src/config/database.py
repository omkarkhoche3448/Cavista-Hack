from supabase import Client, create_client

from .settings import settings

supabase_client: Client = create_client(
    str(settings.SUPABASE_URL),
    settings.SUPABASE_KEY,
)


def get_supabase() -> Client:
    return supabase_client


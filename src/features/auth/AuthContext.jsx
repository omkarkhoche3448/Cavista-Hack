import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/config/supabase";
import { fetchProfile } from "@/services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(currentSession) {
    if (!currentSession) {
      setProfile(null);
      return;
    }

    try {
      const data = await fetchProfile(currentSession.access_token);
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      loadProfile(s).finally(() => setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      loadProfile(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    session,
    profile,
    loading,
    isAuthenticated: !!session,
    role: profile?.role ?? user?.user_metadata?.role ?? null,
    refreshProfile: () => loadProfile(session),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

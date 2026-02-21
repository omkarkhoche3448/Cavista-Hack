import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/config/supabase";
import { fetchProfile } from "@/services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null);
      return;
    }

    // Skip if we already have this user's profile
    // We compare strings to avoid object reference issues
    setProfile(prev => {
      if (prev && prev.id === currentSession.user.id) {
        return prev;
      }

      // If different or first time, we need to fetch
      // But we can't await inside setProfile, so we'll trigger the fetch outside
      return prev;
    });

    // Actually, let's just do it simply but with a ref to avoid overlap
    if (profile && profile.id === currentSession.user.id) {
      return;
    }

    try {
      const data = await fetchProfile(currentSession.access_token);
      setProfile(data);
    } catch (err) {
      console.error("[AuthContext] Profile fetch failed:", err);
      if (!profile) setProfile(null);
    }
  }, [profile]);

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
  }, [loadProfile]);

  const refreshProfile = useCallback(() => {
    return loadProfile(session);
  }, [loadProfile, session]);

  const value = {
    user,
    session,
    profile,
    loading,
    isAuthenticated: !!session,
    role: profile?.role ?? user?.user_metadata?.role ?? null,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

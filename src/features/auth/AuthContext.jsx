/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/config/supabase";
import { fetchProfile } from "@/services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedUserIdRef = useRef(null);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setProfile(null);
      fetchedUserIdRef.current = null;
      return;
    }

    // Skip if we already fetched for this user — ref avoids stale closure issues
    if (fetchedUserIdRef.current === currentSession.user.id) {
      return;
    }

    try {
      const data = await fetchProfile(currentSession.access_token);
      fetchedUserIdRef.current = currentSession.user.id;
      setProfile(data);
    } catch (err) {
      console.error("[AuthContext] Profile fetch failed:", err);
    }
  }, []); // empty deps — uses ref, not state

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
    fetchedUserIdRef.current = null; // force re-fetch
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

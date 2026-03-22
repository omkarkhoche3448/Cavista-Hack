import { supabase } from "@/config/supabase";
import { PROFILE_URL, ONBOARD_URL } from "@/api";
import { apiRequest } from "@/services/apiClient";

export async function signUpWithEmail({
  email,
  password,
  firstName,
  lastName,
  role,
}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role,
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function fetchProfile(accessToken) {
  return apiRequest(PROFILE_URL, { token: accessToken });
}

export async function updateProfile(accessToken, updates) {
  return apiRequest(PROFILE_URL, {
    method: "PATCH",
    token: accessToken,
    json: updates,
  });
}

export async function onboardPatient(accessToken, data) {
  return apiRequest(ONBOARD_URL, {
    method: "POST",
    token: accessToken,
    json: data,
  });
}

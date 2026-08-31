"use client";

import { createClient } from "@supabase/supabase-js";
import { consumeAdminSessionHandoff } from "@/lib/admin-session-handoff";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let pendingAdminSessionHandoff: { access_token: string; refresh_token: string } | null = null;

if (typeof window !== "undefined") {
  const handoff = consumeAdminSessionHandoff(window.location.href);
  if (handoff) {
    window.history.replaceState(window.history.state, "", handoff.cleanUrl);
    pendingAdminSessionHandoff = handoff.session;
  }
}

export function hasSupabaseBrowserConfig() {
  return Boolean(supabaseUrl && supabaseKey);
}

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function completeAdminSessionHandoff() {
  const session = pendingAdminSessionHandoff;
  pendingAdminSessionHandoff = null;

  if (!session || !supabase) return null;

  const { error } = await supabase.auth.setSession(session);
  return error;
}

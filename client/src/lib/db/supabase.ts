import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Accept either the legacy "anon" JWT key or the newer "publishable" key.
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

let client: SupabaseClient | null = null;

if (typeof window !== "undefined") {
  if (url && anonKey) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "diriyah-auth",
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    });
  } else {
    console.warn(
      "Supabase configuration is incomplete (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Some features may not work.",
    );
  }
}

export const supabase = client;
export const isSupabaseReady = () => client !== null;

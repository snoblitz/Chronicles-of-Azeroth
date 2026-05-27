// ============================================================================
// Supabase client.
//
// Foundation only — nothing in the app wires to this yet (see
// docs/companion-architecture.md §9). Paid tiers (Companion and above) use it
// for cloud sync, auth, and realtime; the free/anonymous tier stays
// localStorage-first.
//
// Config comes from build-time env (browser-safe, anon key only):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//
// The anon key is publishable by design — row access is governed by RLS, not
// by key secrecy. The service-role key is NEVER shipped to the browser; it
// lives only in edge functions / server-side.
//
// `getSupabase()` returns null when env is absent (e.g. the current public
// Pages build), so callers degrade gracefully instead of throwing at import.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient<Database> | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        // We exchange the code by hand in the /auth/callback route so the
        // redirect lands somewhere we control, rather than auto-detecting it
        // on every page load.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

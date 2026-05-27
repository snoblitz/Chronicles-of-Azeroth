// ============================================================================
// Auth — anonymous-by-default sessions + the "Save your chronicle" upgrade.
//
// Model (see docs/companion-architecture.md §3.2, §4):
//   - On first app load with no session, we sign in anonymously. The
//     resulting auth.users.id is the stable owner_id for this device's data.
//   - "Save your chronicle" calls updateUser({ email }) — a magic link that,
//     once clicked, turns the SAME anonymous user into an email-backed
//     account. The id never changes, so no data migration is needed.
//   - Returning users sign in with an email magic link (no password, no
//     OAuth in V1). On a fresh device that already has an anonymous session,
//     signing in discards the anonymous session in favor of the real account
//     (that device's unsynced anonymous data is lost — see §3.3 note).
//
// Nothing here touches the network when Supabase is unconfigured
// (getSupabase() === null), so the current public build is unaffected.
// ============================================================================

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';

const USER_ID_KEY = 'at.user_id';

function cacheUserId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(USER_ID_KEY, id);
    else window.localStorage.removeItem(USER_ID_KEY);
  } catch {
    // localStorage unavailable (private mode) — non-fatal.
  }
}

/** The cached owner_id for this device, if any. Used by cloud sync (task #3). */
export function getCachedUserId(): string | null {
  try {
    return window.localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

// Best-effort profile row for the current user. The handle_new_user trigger
// normally creates it on signup, but anonymous sign-ins may skip the trigger
// depending on project config — this upsert is the safety net. Idempotent and
// non-destructive (won't clobber display_name / tier).
async function ensureProfile(user: User): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from('profiles')
      .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
  } catch {
    // RLS or network hiccup — the trigger likely already handled it.
  }
}

// Dedupe concurrent bootstraps (React StrictMode double-mounts effects).
let anonBootstrap: Promise<User | null> | null = null;

/**
 * Guarantee a session exists, creating an anonymous one if needed.
 * Safe to call repeatedly — concurrent calls share one in-flight promise.
 */
export function ensureAnonymousSession(): Promise<User | null> {
  if (anonBootstrap) return anonBootstrap;
  anonBootstrap = (async () => {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: { session } } = await supabase.auth.getSession();
    let user = session?.user ?? null;

    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        // Most likely: anonymous sign-ins are disabled in the project's
        // Auth settings. Surface it loudly in dev; degrade gracefully.
        console.warn('[aftertale] anonymous sign-in failed:', error.message);
        anonBootstrap = null; // allow a later retry
        return null;
      }
      user = data.user;
    }

    cacheUserId(user?.id ?? null);
    if (user) await ensureProfile(user);
    return user;
  })();
  return anonBootstrap;
}

/** Convert the current anonymous user into an email-backed account. */
export async function saveChronicle(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };
  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: callbackUrl() },
  );
  return { error: error?.message ?? null };
}

/** Sign in a returning user via email magic link (does not create new users). */
export async function signIn(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: callbackUrl(), shouldCreateUser: false },
  });
  return { error: error?.message ?? null };
}

/** Sign out, then drop back to a fresh anonymous session (the default state). */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
  cacheUserId(null);
  anonBootstrap = null;
  await ensureAnonymousSession();
}

/** Exchange the magic-link code for a session (called from /auth/callback). */
export async function exchangeCode(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return { error: 'This link is missing its sign-in code. Request a fresh one.' };
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) cacheUserId(data.session?.user?.id ?? null);
  return { error: error?.message ?? null };
}

// ----------------------------------------------------------------------------
// React hook
// ----------------------------------------------------------------------------

export type AuthStatus = 'loading' | 'anonymous' | 'authed' | 'disabled';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  email: string | null;
}

function deriveState(session: Session | null): AuthState {
  const user = session?.user ?? null;
  if (!user) return { status: 'loading', user: null, email: null };
  if (user.is_anonymous) return { status: 'anonymous', user, email: null };
  return { status: 'authed', user, email: user.email ?? null };
}

/**
 * Subscribe to auth state. Pass `bootstrap: true` (the app shell does this
 * once) to kick off the anonymous-by-default session on mount.
 */
export function useAuth(options: { bootstrap?: boolean } = {}): AuthState {
  const { bootstrap = false } = options;
  const [state, setState] = useState<AuthState>(() =>
    isSupabaseConfigured() ? { status: 'loading', user: null, email: null }
                           : { status: 'disabled', user: null, email: null },
  );

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(deriveState(data.session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState(deriveState(session));
    });

    if (bootstrap) void ensureAnonymousSession();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [bootstrap]);

  return state;
}

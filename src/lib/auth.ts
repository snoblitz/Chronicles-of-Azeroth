// ============================================================================
// Auth — anonymous-by-default sessions + the "Save your chronicle" upgrade.
//
// Model (see docs/companion-architecture.md §3.2, §4):
//   - On first app load with no session, we sign in anonymously. The
//     resulting auth.users.id is the stable owner_id for this device's data.
//   - "Save your chronicle" calls updateUser({ email }) then verifies a 6-digit
//     emailed OTP code (verifyCode, type 'email_change'). This turns the SAME
//     anonymous user into an email-backed account — the id never changes, so no
//     data migration is needed.
//   - Returning users sign in with an emailed 6-digit OTP code
//     (signInWithOtp + verifyCode type 'email'; no password, no OAuth in V1).
//     On a fresh device with an existing anonymous session, signing in discards
//     it in favor of the real account (that device's unsynced anonymous data is
//     kept on-device but not pushed — see cloudSync's cloudAuthoritative path).
//   - We use OTP CODES, not magic-link redirects: a code works in any browser /
//     device (no PKCE same-browser constraint), so reading email on a phone and
//     using the app on a desktop is fine. Email templates must emit {{ .Token }}.
//     The legacy /auth/callback + exchangeCode() path is kept as a dead fallback.
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

// The anonymous user.id we started a "save" upgrade with — verifyCode asserts
// the id is preserved so cloud-sync upgrade continuity holds.
let pendingUpgradeUid: string | null = null;

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
export async function saveChronicle(email: string): Promise<{ error: string | null; conflict?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };

  // The upgrade is tied to THIS anonymous session — capture its id so we can
  // assert continuity when the code is verified (id must not change, or cloud
  // sync's upgrade classification breaks and local heroes could be tombstoned).
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return { error: 'No active session. Reload and try again.' };
  if (!user.is_anonymous) {
    return { error: 'This chronicle is already saved to an account on this device.' };
  }
  pendingUpgradeUid = user.id;

  const { error } = await supabase.auth.updateUser({ email: email.trim() });
  if (error) {
    const raw = error.message ?? '';
    if (/already|registered|exists/i.test(raw)) {
      // Don't silently fall through to sign-in — that could trigger
      // cloud-authoritative hydrate and tombstone this device's scratch heroes.
      return { error: 'That email already has a chronicle.', conflict: true };
    }
    return { error: raw };
  }
  return { error: null };
}

/** Sign in a returning user via email one-time code (does not create new users). */
export async function signIn(email: string): Promise<{ error: string | null; conflict?: boolean }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  });
  return { error: error?.message ?? null };
}

/**
 * Verify the 6-digit code from the email. `mode` selects the OTP type:
 * 'save' = anonymous→account upgrade (email_change), 'signin' = returning user.
 */
export async function verifyCode(
  email: string,
  token: string,
  mode: 'save' | 'signin',
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Cloud accounts are not available in this build.' };
  const code = token.trim();
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code from your email.' };

  if (mode === 'save') {
    // Continuity guard: the session must still be the same anonymous user we
    // started the upgrade with, or the id won't be preserved.
    const { data: { session } } = await supabase.auth.getSession();
    const u = session?.user ?? null;
    if (!u || !u.is_anonymous || (pendingUpgradeUid && u.id !== pendingUpgradeUid)) {
      return { error: 'Your save session changed. Close this and start the save again.' };
    }
  }

  const type = mode === 'save' ? 'email_change' : 'email';
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type });
  if (error) {
    const raw = error.message ?? '';
    if (/expired/i.test(raw)) return { error: 'That code expired. Request a fresh one.' };
    if (/invalid|incorrect|token|not found/i.test(raw)) {
      return { error: 'That code didn’t match. Double-check it and try again.' };
    }
    return { error: raw || 'Could not verify that code. Request a fresh one and try again.' };
  }

  const newUid = data.session?.user?.id ?? data.user?.id ?? null;
  if (mode === 'save' && pendingUpgradeUid && newUid && newUid !== pendingUpgradeUid) {
    return { error: 'Something went wrong saving your chronicle. Please try again.' };
  }
  cacheUserId(newUid);
  pendingUpgradeUid = null;
  return { error: null };
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
  if (!error) {
    cacheUserId(data.session?.user?.id ?? null);
    return { error: null };
  }
  // Translate raw Supabase errors into human copy. The most common failure is
  // PKCE-verifier-missing, which happens when the link is opened in a different
  // browser/device than the one that requested it (especially Gmail's in-app
  // browser on mobile, which has isolated storage).
  const raw = error.message ?? '';
  if (/pkce|code verifier|code_verifier/i.test(raw)) {
    return {
      error:
        'This link needs to open in the same browser where you asked us to save your chronicle. ' +
        'If your email opened it somewhere else (a phone app, a different browser), head back to your ' +
        'chronicle and request a fresh link from the same browser you want to sign in on.',
    };
  }
  if (/expired/i.test(raw)) {
    return { error: 'This link has expired. Head back to your chronicle and request a fresh one.' };
  }
  if (/already.*used|used.*already/i.test(raw)) {
    return { error: 'This link was already used. If you didn’t mean to, request a fresh one.' };
  }
  return { error: raw || 'Something went wrong signing you in. Request a fresh link and try again.' };
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

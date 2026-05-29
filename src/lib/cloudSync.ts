// ============================================================================
// Cloud sync (E1) — localStorage <-> Supabase mirror for signed-in accounts.
//
// Scope (Phase A): backup/restore of a hero's *bible*, *enrichments*, and
// *session recaps* (the "chapters"). Events are NOT synced in Phase A.
//
// Storage model: one row per character. The whole per-character bundle lives
// in `bible.data` (jsonb); the `characters` columns are derived metadata. The
// rigid `chapters(sequence,...)` table is intentionally left empty until the
// Companion / Phase D work models it properly (a trivial server-side backfill
// from the bundle when that day comes).
//
// Conflict model: last-write-wins per character, compared on a *client*
// timestamp written into `data.sync.modifiedAt` (max savedAt across bible +
// enrichments + recaps). Server clocks / `updated_at` are never used as the
// comparator, so device clock skew can't silently lose data.
//
// Hard guarantees:
//   - Completely inert when Supabase is unconfigured (getSupabase() === null)
//     or while the user is anonymous. The current public build is untouched.
//   - The anon -> account upgrade (same auth.uid, empty cloud) NEVER lets the
//     empty cloud win: local pushes up. This is the primary launch flow.
//   - A fresh sign-in to an account that already has cloud data is treated as
//     cloud-authoritative; the device's un-owned local heroes are abandoned
//     (marked do-not-sync) rather than polluting the account. Matches
//     companion-architecture.md §3.3.
//   - Cloud -> local writes are wrapped in a push-suppression guard so the
//     resulting store events don't bounce straight back as an upload.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Database, Json } from '../types/supabase';
import type { CharacterBible } from '../types';
import { listBibles, getBibleByKey, putBibleFromCloud } from './bibleStore';
import {
  loadEnrichments,
  saveEnrichments,
  ENRICHMENTS_UPDATED_EVENT,
  type EnrichmentMap,
} from './enrichmentStore';
import {
  loadSessionRecaps,
  replaceSessionRecaps,
  SESSION_RECAPS_UPDATED_EVENT,
  type SessionRecapMap,
} from './sessionRecapStore';

type Client = SupabaseClient<Database>;

const BUNDLE_SCHEMA_VERSION = 1;
const PUSH_DEBOUNCE_MS = 1500;

// Local bookkeeping (never synced).
const CHARMAP_KEY = 'at.sync.charmap.v1'; // { [createdAtKey]: cloudUuid } — a CACHE, rebuilt from cloud on pull
const TOMBSTONE_KEY = 'at.sync.tombstones.v1'; // { [createdAtKey]: deletedAtMs } — also used to abandon un-owned scratch
const OWNER_KEY = 'at.sync.owner.v1'; // last account uid this device synced as
const HWM_KEY = 'at.sync.hwm.v1'; // { [createdAtKey]: number } — monotonic LWW high-water mark
const COUNT_KEY = 'at.sync.counts.v1'; // { [createdAtKey]: number } — last-observed (enrichments+recaps) count

interface SyncMeta {
  schemaVersion: number;
  createdAtKey: string;
  modifiedAt: number; // client epoch ms — the LWW comparator
  pushedAt: number;
}

interface CloudBundle {
  sync: SyncMeta;
  bible: CharacterBible;
  enrichments: EnrichmentMap;
  sessionRecaps: SessionRecapMap;
}

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------

let booted = false;
let suppressPush = false; // true while applying cloud -> local writes
let syncing = false; // single-flight guard for hydrate / pushAll
let hydratedUid: string | null = null; // account we've already hydrated this session
let lastAnonUid: string | null = null; // most recent anonymous uid observed
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingHydrateUid: string | null = null; // queued hydrate to run after the in-flight op
let pendingPush = false; // queued push to run after the in-flight op
const lastPushedMod: Record<string, number> = {}; // key -> modifiedAt we last successfully pushed

// ---------------------------------------------------------------------------
// observable sync status (for the UI)
// ---------------------------------------------------------------------------

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';
export interface SyncStatus {
  state: SyncState;
  at: number; // epoch ms of the last transition
  error?: string; // human-readable, set when state === 'error'
}
export const SYNC_STATUS_EVENT = 'at:sync-status';

let syncStatus: SyncStatus = { state: 'idle', at: 0 };

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

function setStatus(state: SyncState, error?: string): void {
  syncStatus = { state, at: Date.now(), error };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SyncStatus>(SYNC_STATUS_EVENT, { detail: syncStatus }));
  }
}

// ---------------------------------------------------------------------------
// local bookkeeping helpers
// ---------------------------------------------------------------------------

function readMap(key: string): Record<string, number | string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readCharmap(): Record<string, string> {
  return readMap(CHARMAP_KEY) as Record<string, string>;
}
function writeCharmap(map: Record<string, string>): void {
  try {
    localStorage.setItem(CHARMAP_KEY, JSON.stringify(map));
  } catch {
    /* fail soft */
  }
}

function readTombstones(): Record<string, number> {
  return readMap(TOMBSTONE_KEY) as Record<string, number>;
}
function writeTombstones(map: Record<string, number>): void {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(map));
  } catch {
    /* fail soft */
  }
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
function writeOwner(uid: string): void {
  try {
    localStorage.setItem(OWNER_KEY, uid);
  } catch {
    /* fail soft */
  }
}

function readNumMap(key: string): Record<string, number> {
  return readMap(key) as Record<string, number>;
}
function writeNumMap(key: string, map: Record<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* fail soft */
  }
}

// Run a queued hydrate/push (if any) after the current sync finishes. Hydrate
// takes priority over push, since an auth transition must classify the account
// before any upload can run. Deferred a tick so we never re-enter while the
// `syncing` flag is mid-transition.
function drainPending(): void {
  if (pendingHydrateUid) {
    const uid = pendingHydrateUid;
    pendingHydrateUid = null;
    pendingPush = false;
    setTimeout(() => void hydrate(uid), 0);
  } else if (pendingPush) {
    pendingPush = false;
    setTimeout(() => void pushAll(), 0);
  }
}

// ---------------------------------------------------------------------------
// timestamps + bundle assembly
// ---------------------------------------------------------------------------

/**
 * The LWW comparator for a character: the most recent client-side save across
 * its bible, enrichments and recaps. Recaps/enrichments bump their own savedAt
 * without touching bible.updatedAt, so we must fold all three in.
 */
function localModifiedAt(
  bible: CharacterBible,
  enrichments: EnrichmentMap,
  recaps: SessionRecapMap,
): number {
  let m = bible.updatedAt || 0;
  for (const rec of Object.values(enrichments)) {
    if (rec && rec.savedAt > m) m = rec.savedAt;
  }
  for (const rec of Object.values(recaps)) {
    if (rec && rec.savedAt > m) m = rec.savedAt;
  }
  return m;
}

function bundleEntryCount(enrichments: EnrichmentMap, recaps: SessionRecapMap): number {
  return Object.keys(enrichments).length + Object.keys(recaps).length;
}

/**
 * The LWW comparator made monotonic. Deleting the newest enrichment/recap would
 * otherwise *lower* localModifiedAt (its savedAt vanishes), letting a stale
 * device that still holds that record win LWW and resurrect the deleted content.
 * To prevent that we keep a per-character high-water mark, bumped to now()
 * whenever the (enrichment+recap) count shrinks. Has a side effect: persists the
 * observed count + hwm. Call it as the single source of "what's this hero's
 * modifiedAt right now" on the local side.
 */
function effectiveModifiedAt(
  key: string,
  bible: CharacterBible,
  enrichments: EnrichmentMap,
  recaps: SessionRecapMap,
): number {
  const base = localModifiedAt(bible, enrichments, recaps);
  const count = bundleEntryCount(enrichments, recaps);

  const counts = readNumMap(COUNT_KEY);
  const hwm = readNumMap(HWM_KEY);
  const prevCount = counts[key];
  if (prevCount !== undefined && count < prevCount) {
    // A deletion shrank the bundle — advance the mark so the delete wins LWW.
    hwm[key] = Math.max(hwm[key] ?? 0, Date.now());
    writeNumMap(HWM_KEY, hwm);
  }
  if (counts[key] !== count) {
    counts[key] = count;
    writeNumMap(COUNT_KEY, counts);
  }
  return Math.max(base, hwm[key] ?? 0);
}

/** Adopt a cloud bundle's modifiedAt into the local marks (post-hydrate) so a
 *  freshly-pulled hero isn't immediately re-pushed at a lower timestamp. */
function adoptCloudMarks(key: string, bundle: CloudBundle): void {
  const mod = bundle.sync?.modifiedAt ?? 0;
  const count = bundleEntryCount(bundle.enrichments ?? {}, bundle.sessionRecaps ?? {});
  const counts = readNumMap(COUNT_KEY);
  counts[key] = count;
  writeNumMap(COUNT_KEY, counts);
  const hwm = readNumMap(HWM_KEY);
  hwm[key] = Math.max(hwm[key] ?? 0, mod);
  writeNumMap(HWM_KEY, hwm);
  lastPushedMod[key] = mod;
}

function buildBundle(key: string, bible: CharacterBible, modifiedAt: number): CloudBundle {
  return {
    sync: {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      createdAtKey: key,
      modifiedAt,
      pushedAt: Date.now(),
    },
    bible,
    enrichments: loadEnrichments(key),
    sessionRecaps: loadSessionRecaps(key),
  };
}

function bundleKey(bundle: CloudBundle): string {
  return bundle.sync?.createdAtKey ?? String(bundle.bible?.createdAt ?? '');
}

// Tolerate either embedded shape supabase may return for the 1:1 bible join.
function extractBundle(row: unknown): CloudBundle | null {
  const bibleField = (row as { bible?: unknown })?.bible;
  const rec = Array.isArray(bibleField) ? bibleField[0] : bibleField;
  const data = (rec as { data?: unknown })?.data;
  if (!data || typeof data !== 'object') return null;
  const bundle = data as CloudBundle;
  if (!bundle.bible) return null;
  return bundle;
}

// ---------------------------------------------------------------------------
// cloud writes
// ---------------------------------------------------------------------------

async function ensureProfileExists(supabase: Client, uid: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: uid }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      console.warn('[cloudSync] ensureProfile failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[cloudSync] ensureProfile threw:', err);
    return false;
  }
}

function characterColumns(uid: string, bible: CharacterBible) {
  return {
    owner_id: uid,
    name: bible.name,
    realm: bible.realm ?? null,
    class: bible.class ?? null,
    race: bible.race ?? null,
    level: bible.level ?? null,
    core_quote: bible.coreQuote ?? null,
  };
}

/**
 * Push one character up. Ordering matters: ensure the `characters` row exists
 * (and its uuid is cached) BEFORE upserting the bible bundle, so a crash never
 * leaves a bible row pointing at a missing character. Records lastPushedMod
 * only on a fully successful round-trip.
 */
async function pushCharacter(
  supabase: Client,
  uid: string,
  key: string,
  bible: CharacterBible,
  charmap: Record<string, string>,
  modifiedAt: number,
): Promise<boolean> {
  const bundle = buildBundle(key, bible, modifiedAt);
  let uuid = charmap[key];
  try {
    if (!uuid) {
      const { data, error } = await supabase
        .from('characters')
        .insert(characterColumns(uid, bible))
        .select('id')
        .single();
      if (error || !data) {
        console.warn('[cloudSync] character insert failed', key, error?.message);
        return false;
      }
      uuid = data.id;
      charmap[key] = uuid;
      writeCharmap(charmap);
    } else {
      const { error } = await supabase
        .from('characters')
        .update(characterColumns(uid, bible))
        .eq('id', uuid);
      if (error) {
        console.warn('[cloudSync] character update failed', key, error.message);
        return false;
      }
    }

    const { error: bErr } = await supabase
      .from('bible')
      .upsert(
        { character_id: uuid, data: bundle as unknown as Json },
        { onConflict: 'character_id' },
      );
    if (bErr) {
      console.warn('[cloudSync] bible upsert failed', key, bErr.message);
      return false;
    }
    lastPushedMod[key] = bundle.sync.modifiedAt;
    return true;
  } catch (err) {
    console.warn('[cloudSync] push error', key, err);
    return false;
  }
}

async function deleteCloudCharacter(supabase: Client, uuid: string, key: string): Promise<void> {
  try {
    // bible / chapters / events cascade off characters.
    const { error } = await supabase.from('characters').delete().eq('id', uuid);
    if (error) console.warn('[cloudSync] cloud delete failed', key, error.message);
  } catch (err) {
    console.warn('[cloudSync] cloud delete threw', key, err);
  }
  const charmap = readCharmap();
  delete charmap[key];
  writeCharmap(charmap);
  const tombs = readTombstones();
  tombs[key] = Date.now();
  writeTombstones(tombs);
  delete lastPushedMod[key];
}

// ---------------------------------------------------------------------------
// cloud -> local
// ---------------------------------------------------------------------------

/** Apply a cloud bundle into local storage, suppressing the resulting push. */
function applyCloudBundle(key: string, bundle: CloudBundle): void {
  suppressPush = true;
  try {
    if (bundle.bible) putBibleFromCloud(bundle.bible);
    saveEnrichments(key, bundle.enrichments ?? {});
    replaceSessionRecaps(key, bundle.sessionRecaps ?? {});
    adoptCloudMarks(key, bundle);
  } finally {
    suppressPush = false;
  }
}

interface CloudChar {
  uuid: string;
  bundle: CloudBundle;
  mod: number;
}

async function fetchCloudChars(supabase: Client, uid: string): Promise<Map<string, CloudChar> | null> {
  const { data, error } = await supabase
    .from('characters')
    .select('id, bible(data)')
    .eq('owner_id', uid);
  if (error) {
    console.warn('[cloudSync] fetch characters failed:', error.message);
    return null;
  }
  const out = new Map<string, CloudChar>();
  for (const row of data ?? []) {
    const bundle = extractBundle(row);
    if (!bundle) continue; // partial row (character without bible) — tolerate, skip
    const key = bundleKey(bundle);
    if (!key) continue;
    out.set(key, { uuid: (row as { id: string }).id, bundle, mod: bundle.sync?.modifiedAt ?? 0 });
  }
  return out;
}

/**
 * Reconcile cloud <-> local for an authenticated account. Runs at most once
 * per uid per session (idempotent if it runs again).
 */
async function hydrate(uid: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  if (syncing) {
    // Queue it — never silently drop an auth-driven hydrate.
    pendingHydrateUid = uid;
    return;
  }
  if (hydratedUid === uid) {
    // Already reconciled this account; just flush any pending local edits.
    schedulePush();
    return;
  }

  syncing = true;
  setStatus('syncing');
  // A pending debounced push could otherwise race the hydrate and clobber it.
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  let hadError = false;
  try {
    if (!(await ensureProfileExists(supabase, uid))) {
      setStatus('error', 'Could not reach your account.');
      return;
    }

    const cloud = await fetchCloudChars(supabase, uid);
    if (!cloud) {
      setStatus('error', 'Could not load your chronicle.');
      return;
    }

    const cloudHasData = cloud.size > 0;
    const isUpgrade = lastAnonUid === uid || readOwner() === uid;
    // Fresh sign-in to an account that already holds data: cloud is the source
    // of truth and this device's un-owned heroes are NOT this account's work.
    const cloudAuthoritative = !isUpgrade && cloudHasData;

    const localKeys = new Set(listBibles().map((e) => e.key));
    const tombstones = readTombstones();
    const charmap = readCharmap();

    if (cloudAuthoritative) {
      suppressPush = true;
      try {
        // Abandon local-only scratch: keep it on-device but never sync it
        // (do-not-sync tombstone). Avoids polluting the account; non-destructive.
        const stamp = Date.now();
        for (const key of localKeys) {
          if (!cloud.has(key)) tombstones[key] = stamp;
        }
        for (const [key, c] of cloud) {
          applyCloudBundle(key, c.bundle);
          charmap[key] = c.uuid;
          delete tombstones[key]; // cloud-present keys are live, not abandoned
        }
      } finally {
        suppressPush = false;
      }
      writeTombstones(tombstones);
      writeCharmap(charmap);
    } else {
      // Continuity / upgrade / brand-new account: per-character LWW merge,
      // and local-only heroes get pushed up (never lost to an empty cloud).
      for (const [key, c] of cloud) {
        charmap[key] = c.uuid;
        const tomb = tombstones[key] ?? 0;
        if (tomb > c.mod) {
          // Local deletion is newer than the cloud copy — propagate the delete.
          await deleteCloudCharacter(supabase, c.uuid, key);
          continue;
        }
        const localBible = getBibleByKey(key);
        if (!localBible) {
          applyCloudBundle(key, c.bundle); // not on this device yet — pull it
          continue;
        }
        const localMod = effectiveModifiedAt(key, localBible, loadEnrichments(key), loadSessionRecaps(key));
        if (c.mod > localMod) {
          applyCloudBundle(key, c.bundle); // cloud newer — cloud wins
        }
        // else local is newer or equal — leave it; the push loop below sends it.
      }
      writeCharmap(charmap);

      for (const key of localKeys) {
        if (tombstones[key]) continue;
        const localBible = getBibleByKey(key);
        if (!localBible) continue;
        const c = cloud.get(key);
        const localMod = effectiveModifiedAt(key, localBible, loadEnrichments(key), loadSessionRecaps(key));
        if (!c || localMod > c.mod) {
          const ok = await pushCharacter(supabase, uid, key, localBible, charmap, localMod);
          if (!ok) hadError = true;
        }
      }
    }

    writeOwner(uid);
    hydratedUid = uid;
    setStatus(hadError ? 'error' : 'synced', hadError ? 'Some changes didn’t save.' : undefined);
  } finally {
    syncing = false;
    drainPending();
  }
}

// ---------------------------------------------------------------------------
// local -> cloud (debounced)
// ---------------------------------------------------------------------------

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushAll();
  }, PUSH_DEBOUNCE_MS);
}

async function pushAll(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  if (syncing) {
    pendingPush = true; // queue — don't drop the change
    return;
  }

  // Claim the lock before any await so two concurrent timers can't both enter.
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user || user.is_anonymous) return; // only real accounts sync

    const uid = user.id;
    // Never push before this account has been classified by hydrate — a pending
    // pre-sign-in push must not pollute an existing account (fresh-sign-in case).
    if (hydratedUid !== uid) {
      pendingHydrateUid = uid;
      return;
    }

    const charmap = readCharmap();
    const tombstones = readTombstones();
    const localKeys = new Set(listBibles().map((e) => e.key));

    // Pre-scan so a no-op push (everything already synced) doesn't flash the
    // status pill — only announce 'syncing' when there's real work to do.
    const dirty: Array<{ key: string; bible: CharacterBible; mod: number }> = [];
    for (const key of localKeys) {
      if (tombstones[key]) continue; // deleted or abandoned-scratch — never push
      const bible = getBibleByKey(key);
      if (!bible) continue;
      const mod = effectiveModifiedAt(key, bible, loadEnrichments(key), loadSessionRecaps(key));
      if (lastPushedMod[key] === mod) continue; // unchanged since last push
      dirty.push({ key, bible, mod });
    }
    const deletions = Object.keys(charmap).filter((key) => !localKeys.has(key));
    if (dirty.length === 0 && deletions.length === 0) return; // nothing to do

    setStatus('syncing');
    let hadError = false;
    if (!(await ensureProfileExists(supabase, uid))) {
      setStatus('error', 'Could not reach your account.');
      return;
    }

    for (const { key, bible, mod } of dirty) {
      const ok = await pushCharacter(supabase, uid, key, bible, charmap, mod);
      if (!ok) hadError = true;
    }

    // Deletes: a key we have a cloud uuid for but no longer have locally was
    // deleted on this device — propagate (sets a tombstone so it can't zombie).
    for (const key of deletions) {
      await deleteCloudCharacter(supabase, charmap[key], key);
    }

    setStatus(hadError ? 'error' : 'synced', hadError ? 'Some changes didn’t save.' : undefined);
  } finally {
    syncing = false;
    drainPending();
  }
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

/**
 * Wire up cloud sync. Safe to call once on app mount. No-ops entirely when
 * Supabase is unconfigured. Idempotent.
 */
export function initCloudSync(): void {
  const supabase = getSupabase();
  if (!supabase || booted) return;
  booted = true;

  // Auth transitions drive hydrate. onAuthStateChange fires an INITIAL_SESSION
  // event on subscribe, so this also covers the already-signed-in-at-boot case.
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    if (!user) {
      // Signed out — next sign-in should re-hydrate.
      hydratedUid = null;
      lastAnonUid = null;
      setStatus('idle');
      return;
    }
    if (user.is_anonymous) {
      lastAnonUid = user.id;
      setStatus('idle');
      return;
    }
    void hydrate(user.id);
  });

  // Local store changes -> debounced push (skipped while applying cloud writes).
  const onLocalChange = () => {
    if (!suppressPush) schedulePush();
  };
  window.addEventListener('at:bible-updated', onLocalChange);
  window.addEventListener('at:bible-roster-updated', onLocalChange);
  window.addEventListener(ENRICHMENTS_UPDATED_EVENT, onLocalChange);
  window.addEventListener(SESSION_RECAPS_UPDATED_EVENT, onLocalChange);
}

/**
 * User-triggered "try again" after a sync failure. Re-runs the right operation
 * for the current account: a full hydrate if we never reconciled this uid,
 * otherwise just flush local edits up.
 */
export async function retrySync(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user ?? null;
  if (!user || user.is_anonymous) return;
  if (hydratedUid === user.id) {
    schedulePush();
  } else {
    await hydrate(user.id);
  }
}

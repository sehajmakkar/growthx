import { newId } from "@growthx/shared/runtime";

/**
 * Identity is sticky and anonymous. The visitor id is what variant assignment
 * hashes on, so it must survive reloads or bucketing would reshuffle on every
 * page view and the experiment would be meaningless.
 *
 * Every accessor is wrapped: storage throws in Safari private mode and in
 * third-party iframes with cookies blocked, and the snippet must never break a
 * customer's page. If storage is unavailable we fall back to a per-pageview id,
 * which loses stickiness but keeps the page working.
 */
const VISITOR_KEY = "_gx_v";
const SESSION_KEY = "_gx_s";
const SESSION_TS_KEY = "_gx_st";
const SESSION_IDLE_MS = 30 * 60 * 1000;

function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(store: Storage | undefined, key: string, value: string): void {
  try {
    store && store.setItem(key, value);
  } catch {
    /* private mode, quota, blocked storage — never fatal */
  }
}

function ls(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function ss(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export interface Identity {
  visitorId: string;
  sessionId: string;
  isReturning: boolean;
}

export function identify(): Identity {
  const store = ls();
  let visitorId = safeGet(store, VISITOR_KEY);
  const isReturning = !!visitorId;
  if (!visitorId) {
    visitorId = newId("vis", 14);
    safeSet(store, VISITOR_KEY, visitorId);
  }

  // A session ends after 30 minutes of inactivity, not when the tab closes:
  // a visitor who opens three pages over ten minutes is one session.
  const session = ss();
  const now = Date.now();
  const lastTs = Number(safeGet(session, SESSION_TS_KEY) ?? 0);
  let sessionId = safeGet(session, SESSION_KEY);
  if (!sessionId || !lastTs || now - lastTs > SESSION_IDLE_MS) {
    sessionId = newId("sess", 14);
    safeSet(session, SESSION_KEY, sessionId);
  }
  safeSet(session, SESSION_TS_KEY, String(now));

  return { visitorId, sessionId, isReturning };
}

/** Manifest cache, so a repeat visit needs no network before it can mutate. */
const MANIFEST_KEY = "_gx_m";

export function readCachedManifest<T>(ttlMs: number): T | null {
  const raw = safeGet(ls(), MANIFEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { t: number; m: T };
    if (Date.now() - parsed.t > ttlMs) return null;
    return parsed.m;
  } catch {
    return null;
  }
}

export function writeCachedManifest(manifest: unknown): void {
  try {
    safeSet(ls(), MANIFEST_KEY, JSON.stringify({ t: Date.now(), m: manifest }));
  } catch {
    /* ignore */
  }
}

/**
 * The session's experiment assignment, remembered across pages.
 *
 * A conversion almost always happens on a *different* page from the experiment
 * — you are bucketed on the landing page and you convert on the success page,
 * where no experiment runs. Without this, every conversion records a null
 * variant and the arms cannot be compared at all: the experiment silently has
 * no outcome data.
 */
const ASSIGNMENT_KEY = "_gx_a";

export interface Assignment {
  experimentId: string;
  variantId: string;
}

export function readAssignment(): Assignment | null {
  const raw = safeGet(ss(), ASSIGNMENT_KEY);
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Assignment;
    return a && a.experimentId && a.variantId ? a : null;
  } catch {
    return null;
  }
}

export function writeAssignment(a: Assignment): void {
  safeSet(ss(), ASSIGNMENT_KEY, JSON.stringify(a));
}

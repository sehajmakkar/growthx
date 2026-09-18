import { BATCH } from "@growthx/shared/runtime";

/**
 * Event queue: batches, flushes on a timer, and — critically — flushes with
 * `sendBeacon` when the page goes away.
 *
 * The last few events of a session are the most informative ones (the rage
 * click, the back-exit, the scroll that never reached the CTA) and they are
 * exactly the ones a naive `fetch` on unload loses. Beacon survives navigation;
 * fetch does not.
 */
declare const __GX_API__: string;

export interface QueuedEvent {
  type: string;
  ts: number;
  seq: number;
  path: string;
  experimentId: string | null;
  variantId: string | null;
  selector?: string | null;
  elemFrac?: { x: number; y: number } | null;
  pageFrac?: { x: number; y: number };
  vpFrac?: { x: number; y: number };
  scrollY?: number;
  docH?: number;
  payload?: Record<string, unknown>;
}

export interface Session {
  siteId: string;
  visitorId: string;
  sessionId: string;
  isReturning: boolean;
  device: string;
  viewport: { w: number; h: number };
  referrer: string;
  simulated: boolean;
  persona: string | null;
}

let queue: QueuedEvent[] = [];
let seq = 0;
let session: Session | null = null;
let timer: number | null = null;

export function initCollector(s: Session): void {
  session = s;
  // Both matter: `visibilitychange` is the only one that reliably fires on
  // mobile Safari when the user switches apps, and `pagehide` covers bfcache.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
  window.addEventListener("beforeunload", () => flush(true));
}

export function record(
  type: string,
  fields: Partial<QueuedEvent> = {}
): void {
  if (!session) return;
  queue.push({
    type,
    ts: Date.now(),
    seq: seq++,
    path: location.pathname,
    experimentId: fields.experimentId ?? null,
    variantId: fields.variantId ?? null,
    ...fields,
  } as QueuedEvent);

  if (queue.length >= BATCH.maxEvents) {
    flush(false);
  } else if (timer === null) {
    timer = window.setTimeout(() => flush(false), BATCH.flushIntervalMs);
  }
}

export function flush(useBeacon: boolean): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!session || queue.length === 0) return;

  const body = JSON.stringify({ v: 1, ...session, events: queue });
  queue = [];

  const url = __GX_API__ + "/collect";
  try {
    if (useBeacon && navigator.sendBeacon) {
      // text/plain avoids a CORS preflight, which would never complete during
      // unload. The endpoint parses the body regardless of content-type.
      navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    }).catch(() => {});
  } catch {
    /* a customer's page must never break because our telemetry failed */
  }
}

/** FNV-1a 32-bit. Used for variant bucketing and event-shard selection. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Number of event-table partition shards. PLAN.md §4.1. */
export const EVENT_SHARDS = 10;

export function shardFor(sessionId: string): number {
  return fnv1a(sessionId) % EVENT_SHARDS;
}

/**
 * Sticky variant assignment. Deterministic on (visitorId, experimentId) so the
 * snippet buckets locally and the manifest stays edge-cacheable. PLAN.md §9.1.
 * `split` maps variantId -> percentage, summing to 100.
 */
export function bucketVariant(
  visitorId: string,
  experimentId: string,
  split: Record<string, number>
): string | null {
  const ids = Object.keys(split).sort();
  if (ids.length === 0) return null;
  const point = fnv1a(visitorId + ":" + experimentId) % 100;
  let cursor = 0;
  for (const id of ids) {
    cursor += split[id] ?? 0;
    if (point < cursor) return id;
  }
  return ids[ids.length - 1] ?? null;
}

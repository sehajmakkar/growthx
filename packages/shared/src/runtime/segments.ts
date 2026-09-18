export const SEGMENT_DIMENSIONS = ["device", "visitor", "outcome"] as const;
export type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number];
export type SegmentSpec = Partial<Record<SegmentDimension, string>>;

/**
 * Canonical segment key, e.g. "device=mobile|outcome=bounced". Dimensions are
 * sorted so the same segment always yields the same key — this is a DynamoDB
 * sort-key component, so "mobile+bounced" and "bounced+mobile" must never
 * become two different rows.
 */
export function segmentKey(spec: SegmentSpec): string {
  const parts: string[] = [];
  for (const d of SEGMENT_DIMENSIONS) {
    const v = spec[d];
    if (v != null) parts.push(d + "=" + v);
  }
  return parts.length ? parts.join("|") : "all";
}

export function parseSegmentKey(key: string): SegmentSpec {
  if (key === "all") return {};
  const spec: SegmentSpec = {};
  for (const part of key.split("|")) {
    const [d, v] = part.split("=");
    if (d && v && (SEGMENT_DIMENSIONS as readonly string[]).includes(d)) {
      spec[d as SegmentDimension] = v;
    }
  }
  return spec;
}

/** The nine segments we actually compute. PLAN.md §6 P8. */
export const COMPUTED_SEGMENTS: readonly string[] = [
  segmentKey({}),
  segmentKey({ device: "mobile" }),
  segmentKey({ device: "desktop" }),
  segmentKey({ visitor: "new" }),
  segmentKey({ visitor: "returning" }),
  segmentKey({ outcome: "converted" }),
  segmentKey({ outcome: "bounced" }),
  segmentKey({ device: "mobile", outcome: "bounced" }),
  segmentKey({ device: "mobile", visitor: "new" }),
];

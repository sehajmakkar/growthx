import { z } from "zod";
import { DeviceClassSchema, Frac, Viewport } from "./common.js";

/** Behavioural event types the snippet emits. PLAN.md §4.1. */
export const EventType = z.enum([
  "pageview",
  "exposure",
  "click",
  "dead_click",
  "rage_click",
  "scroll",
  "element_view",
  "dwell",
  "hover",
  "back_exit",
  "conversion",
  "custom",
]);
export type EventType = z.infer<typeof EventType>;

/**
 * Spatial payload. PLAN.md §4.4 — element-relative fractions are the PRIMARY
 * signal. Raw pixels are never the source of truth; they break across screen
 * sizes and make the agent draw wrong conclusions.
 */
export const SpatialPayload = z.object({
  selector: z.string().max(200).nullable(),
  /** Fraction of the clicked element's own bounding box. Primary signal. */
  elemFrac: Frac.nullable(),
  /** Fraction of full document width/height. Overlay fallback. */
  pageFrac: Frac,
  /** Fraction of viewport. Used for above/below-fold reasoning. */
  vpFrac: Frac,
  scrollY: z.number(),
  docH: z.number(),
});

export const ScrollPayload = z.object({
  maxScrollFrac: z.number().min(0).max(1),
  bandsCrossed: z.array(z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)])),
  docH: z.number(),
});

export const ElementViewPayload = z.object({
  selector: z.string().max(200),
  timeToFirstViewMs: z.number(),
  visibleMs: z.number(),
});

export const DwellPayload = z.object({
  selector: z.string().max(200).nullable(),
  ms: z.number(),
});

export const RageClickPayload = SpatialPayload.extend({
  clickCount: z.number().int(),
  withinMs: z.number(),
});

export const ConversionPayload = z.object({
  kind: z.enum(["selector", "url"]),
  value: z.string().max(300),
});

/**
 * One event as sent by the snippet.
 *
 * The spatial fields are promoted to the top level rather than buried in
 * `payload` because they map to real columns and are what every aggregate in
 * §4.2 groups by. `payload` holds only the type-specific remainder.
 */
export const IngestEvent = z.object({
  type: EventType,
  ts: z.number().int(),
  seq: z.number().int(),
  path: z.string().max(300),
  experimentId: z.string().max(80).nullable().default(null),
  variantId: z.string().max(80).nullable().default(null),
  selector: z.string().max(300).nullable().optional(),
  elemFrac: Frac.nullable().optional(),
  pageFrac: Frac.optional(),
  vpFrac: Frac.optional(),
  scrollY: z.number().optional(),
  docH: z.number().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type IngestEvent = z.infer<typeof IngestEvent>;

/** A batch POSTed to /collect. Session-level fields are sent once, not per event. */
export const IngestBatch = z.object({
  v: z.literal(1),
  siteId: z.string().max(80),
  visitorId: z.string().max(80),
  sessionId: z.string().max(80),
  isReturning: z.boolean(),
  device: DeviceClassSchema,
  viewport: Viewport,
  referrer: z.string().max(500).default(""),
  /** Set by the traffic swarm. Anything true here is badged in the UI. */
  simulated: z.boolean().default(false),
  persona: z.string().max(60).nullable().default(null),
  events: z.array(IngestEvent).min(1).max(100),
});
export type IngestBatch = z.infer<typeof IngestBatch>;

/** A stored event row: batch-level fields flattened onto each event. */
export const StoredEvent = IngestEvent.extend({
  siteId: z.string(),
  visitorId: z.string(),
  sessionId: z.string(),
  isReturning: z.boolean(),
  device: DeviceClassSchema,
  viewport: Viewport,
  referrer: z.string(),
  simulated: z.boolean(),
  persona: z.string().nullable(),
});
export type StoredEvent = z.infer<typeof StoredEvent>;


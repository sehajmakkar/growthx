import { z } from "zod";
import { FracRect, Viewport } from "./common.js";

/**
 * The sanitised page outline the variant generator reads. PLAN.md §6 P5.
 *
 * This is the single highest-risk artefact in the project: if it under-describes
 * the page, the model emits selectors that do not resolve and every mutation
 * silently no-ops. The P6 gate exists to measure exactly that.
 */
export const SnapshotElement = z.object({
  /** Built by the SHARED DOM path builder, so event selectors and snapshot
   *  selectors are the same alphabet. PLAN.md §4.4. */
  path: z.string(),
  tag: z.string(),
  classes: z.array(z.string()),
  textSample: z.string().max(120),
  rect: FracRect,
  fontSizePx: z.number(),
  fontWeight: z.number(),
  isInteractive: z.boolean(),
  aboveFoldAt390: z.boolean(),
  aboveFoldAt1440: z.boolean(),
  childCount: z.number().int(),
});
export type SnapshotElement = z.infer<typeof SnapshotElement>;

export const SnapshotPayload = z.object({
  v: z.literal(1),
  siteId: z.string(),
  path: z.string(),
  contentHash: z.string(),
  capturedAt: z.number().int(),
  viewport: Viewport,
  elements: z.array(SnapshotElement).max(400),
});
export type SnapshotPayload = z.infer<typeof SnapshotPayload>;

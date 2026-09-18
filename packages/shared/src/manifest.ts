import { z } from "zod";
import { Mutation } from "./mutations.js";

/**
 * What the snippet fetches before paint. PLAN.md §9.1: this is per (site, path)
 * and NOT per visitor, so CloudFront can cache it. The snippet buckets locally
 * with `bucketVariant`, which removes a cold Lambda from the critical render
 * path — the direct cause of flicker.
 */
export const ManifestVariant = z.object({
  id: z.string(),
  mutations: z.array(Mutation),
});

export const ManifestExperiment = z.object({
  id: z.string(),
  path: z.string(),
  /** variantId -> percentage, summing to 100. */
  split: z.record(z.string(), z.number()),
  variants: z.array(ManifestVariant),
});

export const Manifest = z.object({
  v: z.literal(1),
  siteId: z.string(),
  generatedAt: z.number().int(),
  conversion: z.object({
    kind: z.enum(["selector", "url"]),
    value: z.string(),
  }),
  experiments: z.array(ManifestExperiment),
});
export type Manifest = z.infer<typeof Manifest>;
export type ManifestExperiment = z.infer<typeof ManifestExperiment>;

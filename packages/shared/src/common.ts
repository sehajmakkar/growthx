import { z } from "zod";
import { DEVICE_CLASSES } from "./runtime/device.js";

/** Zod form of the `DeviceClass` type, which is owned by `runtime/device.ts`.
 *  Schemas carry the `Schema` suffix wherever runtime already owns the name. */
export const DeviceClassSchema = z.enum(DEVICE_CLASSES);

/** A point expressed as a fraction (0..1) of some box. See PLAN.md §4.4. */
export const Frac = z.object({ x: z.number(), y: z.number() });
export type Frac = z.infer<typeof Frac>;

export const Viewport = z.object({ w: z.number().int(), h: z.number().int() });
export type Viewport = z.infer<typeof Viewport>;

/** Page-fraction rectangle, used by snapshots and heatmap re-projection. */
export const FracRect = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type FracRect = z.infer<typeof FracRect>;

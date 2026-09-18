import { z } from "zod";
import {
  ATTR_ALLOWLIST,
  MAX_TEXT_LENGTH,
  STYLE_PROP_ALLOWLIST,
} from "./runtime/constants.js";

/**
 * The closed mutation op set. PLAN.md §4.3.
 *
 * There is deliberately no `set_html` / `insert_html` / freeform-markup op, and
 * there never will be. This closed set is what makes agent output safe to apply
 * to a live page, diffable side by side, and near-impossible to render as
 * visually broken garbage.
 *
 * The op list, allowlists and denylist live in `runtime/constants.ts` because
 * the snippet needs them too and cannot bundle zod.
 */

const Selector = z.string().min(1).max(200);
const Note = z.string().max(240).optional();

const StyleProps = z
  .record(z.enum(STYLE_PROP_ALLOWLIST), z.string().max(80))
  .refine((p) => Object.keys(p).length > 0, "at least one property required");

export const Mutation = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace_text"),
    selector: Selector,
    value: z.string().max(MAX_TEXT_LENGTH),
    note: Note,
  }),
  z.object({
    op: z.literal("set_attr"),
    selector: Selector,
    name: z.enum(ATTR_ALLOWLIST),
    value: z.string().max(300),
    note: Note,
  }),
  z.object({
    op: z.literal("set_style"),
    selector: Selector,
    props: StyleProps,
    note: Note,
  }),
  z.object({
    op: z.literal("set_media_style"),
    selector: Selector,
    media: z.enum(["mobile", "desktop"]),
    props: StyleProps,
    note: Note,
  }),
  z.object({
    op: z.literal("add_class"),
    selector: Selector,
    value: z.string().max(80),
    note: Note,
  }),
  z.object({
    op: z.literal("remove_class"),
    selector: Selector,
    value: z.string().max(80),
    note: Note,
  }),
  z.object({ op: z.literal("hide"), selector: Selector, note: Note }),
  z.object({ op: z.literal("show"), selector: Selector, note: Note }),
  z.object({
    op: z.literal("move_before"),
    selector: Selector,
    target: Selector,
    note: Note,
  }),
  z.object({
    op: z.literal("move_after"),
    selector: Selector,
    target: Selector,
    note: Note,
  }),
  z.object({
    op: z.literal("swap"),
    selector: Selector,
    target: Selector,
    note: Note,
  }),
]);
export type Mutation = z.infer<typeof Mutation>;

export const MutationSet = z.array(Mutation).min(1).max(8);
export type MutationSet = z.infer<typeof MutationSet>;

/** Every selector a mutation touches, for validation against the snapshot. */
export function selectorsOf(m: Mutation): string[] {
  const out = [m.selector];
  if ("target" in m && typeof m.target === "string") out.push(m.target);
  return out;
}

export const VariantValidation = z.object({
  selectorsChecked: z.number().int(),
  selectorsMatched: z.number().int(),
  checkedAt: z.string(),
  liveCheck: z.enum(["pending", "passed", "failed"]),
  failures: z.array(z.string()).default([]),
});

export const Variant = z.object({
  variantId: z.string(),
  label: z.string(),
  isControl: z.boolean(),
  rationale: z.string().default(""),
  mutations: z.array(Mutation).default([]),
  validation: VariantValidation.optional(),
  screenshot: z
    .object({ desktopS3Key: z.string(), mobileS3Key: z.string() })
    .partial()
    .optional(),
});
export type Variant = z.infer<typeof Variant>;

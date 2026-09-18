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

/**
 * Renders a snapshot in the exact text form the variant generator sees.
 *
 * This function is the model's entire view of the page, so its legibility is a
 * functional property, not a nicety: if a competent human cannot write a correct
 * CSS selector for the hero CTA from this text alone, neither can a Flash-class
 * model, and the P6 gate will fail. One line per element, pipe-delimited, with a
 * header that names every field — compact enough to fit many elements in a
 * prompt, explicit enough that nothing has to be inferred.
 */
export function renderSnapshotForModel(snap: {
  path: string;
  viewport: { w: number; h: number };
  elements: SnapshotElement[];
}): string {
  const lines: string[] = [];
  lines.push(`PAGE ${snap.path} — ${snap.elements.length} elements`);
  lines.push(
    "Fields: SELECTOR | tag | kind | \"visible text\" | font | y=position down the page | fold at 390px-wide mobile | fold at 1440px desktop"
  );
  lines.push(
    "Use the SELECTOR exactly as written. Every selector below resolves to exactly one element on the live page."
  );
  lines.push(
    "kind: 'text' = a leaf you can rewrite · 'container(n)' = a wrapper whose quoted text is its children's, so rewriting it would destroy them · 'interactive' = a link or button."
  );
  lines.push(
    "named:.foo = a class the element carries that is not part of its selector. Use it to understand what a section is; still target it by its SELECTOR."
  );
  lines.push("");

  for (const e of snap.elements) {
    const text = e.textSample ? `"${e.textSample}"` : "(no text)";
    const font = `${e.fontSizePx}px/${e.fontWeight}`;
    const y = `y=${Math.round(e.rect.y * 100)}%`;
    const mob = e.aboveFoldAt390 ? "mobile:above-fold" : "mobile:BELOW-FOLD";
    const desk = e.aboveFoldAt1440 ? "desktop:above-fold" : "desktop:BELOW-FOLD";
    const role = e.isInteractive
      ? "interactive"
      : e.childCount > 0
        ? `container(${e.childCount})`
        : "text";
    // A selector built from a stable id hides the element's own class names, so
    // `section#customers.social-proof` renders as `#customers` and the agent
    // loses the word "social-proof" entirely. Surfacing the classes costs a few
    // characters and hands back the page's own vocabulary.
    const hidden = e.classes.filter((c) => e.path.indexOf(`.${c}`) === -1);
    const also = hidden.length ? ` | named:${hidden.map((c) => `.${c}`).join("")}` : "";
    lines.push(`${e.path} | ${e.tag} | ${role} | ${text} | ${font} | ${y} | ${mob} | ${desk}${also}`);
  }

  return lines.join("\n");
}

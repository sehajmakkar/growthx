/**
 * The shared DOM path builder. PLAN.md §4.5.
 *
 * This is the most load-bearing file in the project. Event capture uses it to
 * label what a visitor clicked; the P5 snapshot uses it to label what exists on
 * the page. Because both use *this* function, the selectors the agent reads in a
 * heatmap are drawn from the same alphabet as the selectors it is asked to
 * target — which is the entire reason the P6 selector gate can pass. If these
 * two ever diverge, every mutation silently no-ops and there is no product.
 *
 * The builder does not just guess a plausible selector: it verifies that what it
 * emits resolves to exactly one element, which is precisely the constraint the
 * P15 validator enforces server-side.
 */

/** Tailwind and friends. These say how a thing looks, never what it is. */
const UTILITY_PREFIX =
  /^(?:-?(?:m|p)[xytblre]?-|w-|h-|min-|max-|text-|bg-|border|rounded|flex|grid|gap-|items-|justify-|self-|place-|font-|leading-|tracking-|space-|divide-|overflow-|cursor-|select-|order-|col-|row-|z-|opacity-|shadow|ring|outline|transition|duration-|ease-|delay-|animate-|translate|rotate-|scale-|skew-|origin-|blur|brightness|contrast|grayscale|invert|saturate|sepia|backdrop|sr-only|not-sr-only|antialiased|subpixel|inline|block|hidden|contents|table|inline-block|inline-flex|absolute|relative|fixed|sticky|static|top-|left-|right-|bottom-|inset-|float-|clear-|object-|aspect-|container|mx-auto|whitespace|break-|truncate|list-|align-|underline|uppercase|lowercase|capitalize|italic|normal-|decoration|indent-|content-|fill-|stroke-|filter|isolate|mix-|pointer-events|resize|scroll-|snap-|touch-|will-change)/;

function isUtilityClass(c: string): boolean {
  if (!c) return true;
  // Variants (`md:flex`, `hover:bg-x`) and arbitrary values (`text-[1.2rem]`)
  // are never semantic, and they are also invalid in a plain CSS selector
  // without escaping — which would produce a selector that cannot be matched.
  if (/[:[\]()/%.#!]/.test(c)) return true;
  if (/^-?\d/.test(c)) return true;
  return UTILITY_PREFIX.test(c);
}

/** A class a human chose: `cta-primary`, `hero-subcopy`, `tier-2`. */
export function semanticClasses(el: Element): string[] {
  const out: string[] = [];
  const list = el.classList;
  for (let i = 0; i < list.length && out.length < 2; i++) {
    const c = list[i];
    if (c && !isUtilityClass(c)) out.push(c);
  }
  return out;
}

/** Framework-generated ids (`:r3:`, `a1b2c3d4e5`) are not stable across builds. */
function isStableId(id: string): boolean {
  if (!id || id.length > 40) return false;
  if (!/^[A-Za-z][\w-]*$/.test(id)) return false;
  if (/\d{4,}/.test(id)) return false;
  if (/^[0-9a-f]{8,}$/i.test(id)) return false;
  return true;
}

function cssEscape(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

/** One element's own segment, without regard to its ancestors. */
function segment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id && isStableId(el.id)) return `#${el.id}`;

  const classes = semanticClasses(el);
  let s = tag + classes.map((c) => `.${c}`).join("");

  // Disambiguate among siblings only when the segment alone is not enough.
  const parent = el.parentElement;
  if (parent) {
    let matches = 0;
    let index = 0;
    const kids = parent.children;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i]!;
      if (k.tagName !== el.tagName) continue;
      matches++;
      if (k === el) index = matches;
    }
    if (matches > 1) {
      const sameSegment = Array.prototype.filter.call(
        parent.children,
        (k: Element) => k !== el && segmentNoIndex(k) === s
      ).length;
      if (sameSegment > 0) s += `:nth-of-type(${index})`;
    }
  }
  return s;
}

function segmentNoIndex(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id && isStableId(el.id)) return `#${el.id}`;
  return tag + semanticClasses(el).map((c) => `.${c}`).join("");
}

function resolvesToOne(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Builds the shortest selector that resolves to exactly this element.
 * Returns null when no stable path can be found within four ancestors, which is
 * honest: a selector that matches several elements is worse than none, because
 * the agent would target something it never looked at.
 */
export function domPath(el: Element | null): string | null {
  if (!el || !el.tagName) return null;

  const gxId = el.getAttribute && el.getAttribute("data-gx-id");
  if (gxId) {
    const s = `[data-gx-id="${cssEscape(gxId)}"]`;
    if (resolvesToOne(s)) return s;
  }

  if (el.id && isStableId(el.id)) {
    const s = `#${el.id}`;
    if (resolvesToOne(s)) return s;
  }

  // An element with no id and no semantic class of its own gets at least one
  // ancestor for context. A bare `img` or `a:nth-of-type(4)` may well resolve
  // uniquely today, but it tells the model nothing about *what* it is, and it
  // breaks the moment a second image appears. `figure.hero-figure > img` is
  // both more legible and more stable.
  const anonymous = !(el.id && isStableId(el.id)) && semanticClasses(el).length === 0;

  let path = segment(el);
  if (!anonymous && resolvesToOne(path)) return path;

  let node: Element | null = el.parentElement;
  for (let depth = 0; depth < 4 && node && node.tagName !== "HTML" && node.tagName !== "BODY"; depth++) {
    path = `${segment(node)} > ${path}`;
    if (resolvesToOne(path)) return path;
    // A descendant combinator is more tolerant of intermediate wrappers.
    const loose = path.replace(/ > /, " ");
    if (resolvesToOne(loose)) return loose;
    node = node.parentElement;
  }

  // Fall back to the bare segment only if nothing better was found: a selector
  // that resolves is worth more than one that reads nicely.
  if (resolvesToOne(path)) return path;
  const bare = segment(el);
  return resolvesToOne(bare) ? bare : null;
}

/** The nearest ancestor a person would consider "the thing they clicked". */
export function meaningfulTarget(el: Element | null): Element | null {
  let node: Element | null = el;
  for (let i = 0; node && i < 5; i++) {
    const tag = node.tagName.toLowerCase();
    if (
      tag === "a" || tag === "button" || tag === "input" || tag === "label" ||
      node.getAttribute("role") === "button" ||
      semanticClasses(node).length > 0
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return el;
}

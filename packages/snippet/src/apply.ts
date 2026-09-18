import { MEDIA_QUERIES } from "@growthx/shared/runtime";

/**
 * Applies the closed mutation op set (PLAN.md §4.4) to the live DOM.
 *
 * Structural rules this enforces, because the agent's output is only as safe as
 * the thing applying it:
 *  - a selector must resolve to exactly one element, matching the validator that
 *    ran server-side before the variant was ever stored;
 *  - unknown ops are skipped, never guessed at;
 *  - a throw in one mutation never prevents the rest, and never leaves the page
 *    hidden — the customer's site must survive our bugs.
 */

export type Mutation = Record<string, any> & { op: string; selector: string };

export interface ApplyResult {
  applied: number;
  failed: string[];
  /** Selectors that matched nothing — retried once for late-rendering nodes. */
  unresolved: Mutation[];
}

let styleEl: HTMLStyleElement | null = null;

function mediaSheet(): CSSStyleSheet | null {
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.setAttribute("data-gx", "media");
    document.head.appendChild(styleEl);
  }
  return styleEl.sheet as CSSStyleSheet | null;
}

function one(selector: string): HTMLElement | null {
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(selector);
  } catch {
    return null; // malformed selector — treated as unresolved, never thrown
  }
  // Exactly one. Two matches means the variant is ambiguous and applying it
  // would mutate something the agent did not look at.
  return nodes.length === 1 ? (nodes[0] as HTMLElement) : null;
}

function toCssText(props: Record<string, string>): string {
  return Object.keys(props)
    .map((k) => `${k}:${props[k]}`)
    .join(";");
}

export function applyMutations(mutations: Mutation[]): ApplyResult {
  const result: ApplyResult = { applied: 0, failed: [], unresolved: [] };

  for (const m of mutations) {
    let el: HTMLElement | null;
    try {
      el = one(m.selector);
    } catch {
      el = null;
    }
    if (!el) {
      result.unresolved.push(m);
      continue;
    }

    try {
      switch (m.op) {
        case "replace_text":
          el.textContent = String(m.value);
          break;

        case "set_attr":
          el.setAttribute(String(m.name), String(m.value));
          break;

        case "set_style":
          for (const k of Object.keys(m.props)) {
            el.style.setProperty(k, String(m.props[k]));
          }
          break;

        case "set_media_style": {
          const sheet = mediaSheet();
          const query = MEDIA_QUERIES[m.media as "mobile" | "desktop"];
          if (sheet && query) {
            sheet.insertRule(
              `@media ${query}{${m.selector}{${toCssText(m.props)}}}`,
              sheet.cssRules.length
            );
          }
          break;
        }

        case "add_class":
          el.classList.add(String(m.value));
          break;

        case "remove_class":
          el.classList.remove(String(m.value));
          break;

        case "hide":
          el.style.setProperty("display", "none");
          break;

        case "show":
          el.style.removeProperty("display");
          break;

        case "move_before": {
          const target = one(m.target);
          if (!target || target.contains(el)) {
            result.failed.push(m.selector);
            continue;
          }
          target.parentNode!.insertBefore(el, target);
          break;
        }

        case "move_after": {
          const target = one(m.target);
          if (!target || target.contains(el)) {
            result.failed.push(m.selector);
            continue;
          }
          target.parentNode!.insertBefore(el, target.nextSibling);
          break;
        }

        case "swap": {
          const target = one(m.target);
          if (!target || target.contains(el) || el.contains(target)) {
            result.failed.push(m.selector);
            continue;
          }
          const marker = document.createComment("gx");
          el.parentNode!.insertBefore(marker, el);
          target.parentNode!.insertBefore(el, target);
          marker.parentNode!.insertBefore(target, marker);
          marker.parentNode!.removeChild(marker);
          break;
        }

        default:
          // Unknown op: skip loudly in dev, silently in production.
          result.failed.push(`${m.op}:${m.selector}`);
          continue;
      }
      result.applied++;
    } catch {
      result.failed.push(m.selector);
    }
  }

  return result;
}

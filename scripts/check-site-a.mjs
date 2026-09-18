#!/usr/bin/env node
/**
 * Measures Site A's *designed* conversion flaws (PLAN.md §5.2).
 *
 * These flaws are the entire reason Site A exists: if the CTA is not genuinely
 * below the fold on a phone, the agent has no real problem to find in P8 and the
 * demo is theatre. So they are asserted, not eyeballed.
 *
 * Usage:
 *   node scripts/check-site-a.mjs                 # serves sites/site-a/public
 *   node scripts/check-site-a.mjs <url>           # checks a deployed URL
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "sites/site-a/public");

const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const info = (s) => `\x1b[2m  ${s}\x1b[0m`;
const head = (s) => `\n\x1b[1m${s}\x1b[0m`;

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };

async function serve() {
  const server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    try {
      const body = await readFile(path.join(pub, p));
      res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const arg = process.argv[2];
const target = arg ? { url: arg, close: () => {} } : await serve();
const browser = await chromium.launch();
let failures = 0;
const check = (pass, msg) => { console.log(pass ? ok(msg) : bad(msg)); if (!pass) failures++; };

try {
  // ── Mobile: 390×844, the viewport the whole diagnosis is about ───────────
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await mobile.goto(target.url, { waitUntil: "networkidle" });

  const m = await mobile.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, h: r.height, text: el.textContent.trim().slice(0, 40) };
    };
    return {
      vh: innerHeight,
      docH: document.documentElement.scrollHeight,
      cta: box(".cta-primary"),
      ctaHeader: box(".cta-header"),
      figure: box(".hero-figure"),
      subcopy: box(".hero-subcopy"),
      headline: box(".hero-headline"),
      pricing: box(".pricing-table"),
      social: box(".social-proof"),
      tierExpand: box(".tier-2 .tier-expand"),
      banner: box(".secondary-banner"),
      dupes: [".cta-primary", ".hero-subcopy", ".pricing-table", ".social-proof", ".tier-2"]
        .map((s) => [s, document.querySelectorAll(s).length]),
    };
  });

  console.log(head("Flaw 1 — primary CTA below the fold at 390×844"));
  check(m.cta.top > m.vh, `.cta-primary starts at ${Math.round(m.cta.top)}px, fold at ${m.vh}px` +
    (m.cta.top > m.vh ? ` — ${Math.round(m.cta.top - m.vh)}px below` : ` — VISIBLE, flaw absent`));

  console.log(head("Flaw 4 — hero figure dominates the first viewport"));
  const figShare = Math.round((m.figure.h / m.vh) * 100);
  check(figShare >= 30, `.hero-figure occupies ${figShare}% of the first viewport (target ≥30%)`);

  console.log(head("Flaw 1b — supporting copy pushes the CTA down"));
  check(m.subcopy.bottom < m.cta.top, `.hero-subcopy (${Math.round(m.subcopy.h)}px tall) sits above the CTA`);

  console.log(head("Flaw 3 — pricing appears before social proof"));
  check(m.pricing.top < m.social.top,
    `.pricing-table at ${Math.round(m.pricing.top)}px, .social-proof at ${Math.round(m.social.top)}px`);

  console.log(head("Flaw 5 — .tier-2 has a clickable-looking element that does nothing"));
  const expandStyle = await mobile.evaluate(() => {
    const el = document.querySelector(".tier-2 .tier-expand");
    if (!el) return null;
    return { cursor: getComputedStyle(el).cursor, tag: el.tagName, href: el.getAttribute("href"),
             onclick: !!el.onclick };
  });
  check(expandStyle && expandStyle.cursor === "pointer" && expandStyle.tag === "DIV" &&
        !expandStyle.href && !expandStyle.onclick,
    `.tier-expand is a <${expandStyle?.tag}> with cursor:${expandStyle?.cursor}, no href, no handler`);

  console.log(head("Selector hygiene — every agent-facing hook resolves to exactly one element"));
  for (const [sel, n] of m.dupes) check(n === 1, `${sel} → ${n} match${n === 1 ? "" : "es"}`);
  console.log(info(`document height ${m.docH}px · header CTA visible at ${Math.round(m.ctaHeader.top)}px`));

  // ── Desktop: 1440×900 ────────────────────────────────────────────────────
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(target.url, { waitUntil: "networkidle" });
  const d = await desktop.evaluate(() => {
    const r = document.querySelector(".cta-primary").getBoundingClientRect();
    return { ctaTop: r.top + scrollY, vh: innerHeight,
             font: getComputedStyle(document.querySelector(".hero-headline")).fontFamily };
  });

  console.log(head("Desktop 1440×900 — should read as a competent page, CTA above the fold"));
  check(d.ctaTop < d.vh, `.cta-primary at ${Math.round(d.ctaTop)}px, fold at ${d.vh}px`);
  check(/Fraunces/.test(d.font), `headline font resolves to Fraunces (${d.font.split(",")[0]})`);

  await mobile.screenshot({ path: path.join(root, "artifacts/site-a-390.png"), fullPage: true }).catch(() => {});
  await desktop.screenshot({ path: path.join(root, "artifacts/site-a-1440.png"), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  target.close();
}

console.log(failures === 0
  ? `\n${ok("All Site A flaw checks passed. Screenshots in artifacts/.\n")}`
  : `\n${bad(`${failures} check(s) failed — the agent will not find a real problem in P8.\n`)}`);
process.exit(failures === 0 ? 0 : 1);

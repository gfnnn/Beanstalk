# Beansprout — engineering learnings & future considerations

Forward-looking takeaways from a benchmarking exercise that compared this project's
technical backbone against renowned, actively-maintained open-source projects in our
scope (a solo-creative marketing/portfolio site **plus** a small serverless
forms/email/data backend). This file records **only the decided learnings** — the full
comparison report was intentionally not kept. Architecture lives in
[`CLAUDE.md`](../CLAUDE.md); the product backlog in [`ROADMAP.md`](./ROADMAP.md); the
motion system in [`MOTION.md`](./MOTION.md).

## Benchmarks & method

Measured against two **forward-looking** standards (an older Gatsby/JS portfolio that
came up in research was deliberately excluded — we benchmark against where the field is
going, not where it was):

- **`satnaing/astro-paper`** — the modern content-site standard: Astro + TypeScript +
  Tailwind + ESLint/Prettier, ships sitemap/RSS/OG-image/SEO and explicit accessibility
  testing; actively maintained (≈4–5k★, MIT).
- **`cloudflare/templates`** — Cloudflare's own Workers + D1 standard: TypeScript-first,
  Playwright + Vitest, Wrangler/C3/Workers Builds deploy; actively maintained (≈2k★, MIT).

…plus current best-practice references: Astro's "zero-JS-by-default" islands model,
Core Web Vitals thresholds (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1), the OWASP File Upload
guidance ("never trust the client `Content-Type`; verify magic bytes"), and the
cross-document View Transitions browser-support picture (Chrome 126+, Safari 18.2+,
Firefox partial/flagged).

## How to read the tags

- **[IMPROVE]** — a gap to close; an action to take.
- **[KEEP]** — a validated strength; protect it as the project grows.
- **[PARK]** — a deliberate future option; not now, revisit at the right inflection.
- **[CONSIDER]** — optional, lower-priority enhancement.

Priority (`High`/`Medium`/`Low`) reflects leverage, not urgency.

---

## Tooling & code quality

1. **[IMPROVE · High · low-effort] Adopt a linter + formatter** (ESLint + Prettier, or
   **Biome** for a single fast tool) and gate it in CI. Both forward benchmarks ship
   this; we ship neither. Our CI currently proves *correctness* (tests) but not
   *consistency* — this closes that gap and is the cheapest win available.
2. **[IMPROVE · High] Introduce TypeScript incrementally**, starting at the data→render
   contract (`apps/web/src/data/*`, `apps/web/src/build/*`) and the Worker
   (`apps/functions/src/*`). Both benchmarks are TS-first; types would formalise the
   field contracts our `data-integrity` tests currently assert by hand. The Worker is a
   good first target — `cloudflare/templates` shows the idiomatic TS-on-Workers setup.

## Architecture & build

3. **[PARK] Evaluate migrating the static site to Astro** at a future v3 / major-refresh
   inflection — **not now**. Astro would absorb content collections, sitemap, RSS,
   OG-image generation, and SEO injection as community-maintained features, shrinking our
   bespoke surface to just the motion layer; the Cloudflare Worker would stay as-is. Our
   test suite makes this safe to revisit later. Record it as a considered option, not a
   chore.
4. **[KEEP-AWARE] The 7-plugin bespoke Vite build is a known bus-factor-of-one liability.**
   It reimplements things a framework gives for free and is understood by one person. Keep
   it well-documented; the 521-test net is what makes it safe to refactor when needed.
5. **[KEEP] The monorepo split + independent deploys + `develop`→staging / `main`→prod
   gate is team-grade** and validated against how full-stack projects (Cloudflare, T3)
   structure themselves. Preserve it.

## Performance, UX & accessibility

6. **[IMPROVE · Medium] Mind JS weight.** We ship GSAP + Lenis on *every* page — heavier
   than the zero-JS-by-default benchmark. Audit per-page need, scope/defer motion to the
   pages that use it, and track Core Web Vitals as budgets (LCP ≤2.5s, INP ≤200ms,
   CLS ≤0.1).
7. **[IMPROVE · High (a11y)] Motion is our differentiator *and* our biggest a11y risk.**
   Make `prefers-reduced-motion` a **tested invariant** and keep the reduced-motion
   kill-switch airtight — smooth-scroll / scroll-hijacking is a documented accessibility
   concern affecting a large share of macOS/iOS users. See [`MOTION.md`](./MOTION.md).
8. **[IMPROVE · Medium] Add automated accessibility checks** (axe-core inside the
   Playwright tier) — borrow astro-paper's a11y rigour without adopting its stack.
9. **[KEEP-AWARE] View Transitions are correctly timed** (Chrome 126+, Safari 18.2+;
   Firefox still partial/flagged) — maintain a graceful no-VT fallback.
10. **[KEEP] SEO is at/above the modern bar** (canonical/OG/JSON-LD + sitemap/robots +
    staging-noindex). Hold the `ROUTES` + sitemap discipline as new indexable pages are
    added.

## Backend & security

11. **[KEEP] The security backbone is ahead of the field.** Server-side magic-byte
    sniffing (exactly OWASP's "don't trust the client `Content-Type`"), per-IP + global
    rate limiting, atomic flash reservation (`ON CONFLICT DO NOTHING`), fail-open D1, and
    the CORS allowlist exceed what the benchmarks ship. Treat it as our model and don't
    regress it.
12. **[CONSIDER · Low/Medium] Add a defense-in-depth spam layer** for public forms —
    Cloudflare Turnstile and/or a honeypot field — alongside the existing rate limiting.

## Testing & CI

13. **[KEEP] The 521-test (402 web + 119 functions) + 5-spec Playwright tier is a genuine
    strength** — far above typical solo-creative sites, level with Cloudflare's own org.
    It's what lets us refactor fearlessly; protect and extend it as features land. (Note:
    once item 1 lands, CI will cover consistency as well as correctness.)

---

_Recorded 2026-06-07 from a benchmarking review. Update or prune as items are actioned;
move anything that becomes scheduled work into [`ROADMAP.md`](./ROADMAP.md)._

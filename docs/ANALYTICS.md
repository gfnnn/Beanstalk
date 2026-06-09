# Analytics — privacy-first measurement for Beansprout

The decision record for the (now **decided**) Phase-0 analytics item in
[`ROADMAP.md`](./ROADMAP.md) — **Plausible, deferred to post-launch** — plus the wiring plan
for when it's picked up and the two P1 leftovers it gates ("Retargeting pixel", "Instagram
feed embed").

> Status: **decided / not yet wired.** The `track()` scaffold
> (`apps/web/src/js/modules/analytics.js`) deliberately no-ops in production, so the live site
> ships **launch-legal with no tracker and no banner** today. Nothing here is a launch
> blocker — it's the post-launch "turn measurement on" plan.

---

## 1. The decision and why

**Plausible** (managed cloud), switched on post-launch. The rationale, compressed:

- **Cookieless = no consent banner.** A banner is legally owed for non-essential
  cookies/identifiers; Plausible (like Fathom) sets **no cookies** and stores **no personal
  data**, and the UK ICO and France's CNIL have accepted that this style of analytics needs no
  consent. Switching it on adds **zero** consent burden — the house rule. (It's also why the
  scaffold's header says "there's nothing to consent to until [a provider] is" —
  `analytics.js:6-7`.)
- **The artist's "foolproof view" is native.** The hard requirement is that a non-technical
  artist can *read* the numbers without help. Plausible's read-only **shared dashboard link**
  opens with no account and no login — one bookmark gives the handful of numbers that matter:
  visitors + trend, top pages, where they came from ("is my Instagram doing anything?"), the
  conversion events in §3.1, and rough geo/device. No funnels, no reports to maintain.
- **Plausible over Fathom — a close call, not a landslide.** Both are cookieless, no-banner,
  EU-resident, one-clean-page tools; either satisfies the brief. Plausible wins on the cheaper
  entry tier at our modest traffic (~$9/mo vs ~$15/mo, third-party-reported 2026), the cleanest
  no-login shared link, and a genuine **self-host escape hatch** (Plausible Community Edition,
  free, AGPLv3) if we ever want zero third-party anything — Fathom is managed-SaaS only.
- **GA4 is rejected** — two reasons, in order of severity: (1) it **requires a cookie consent
  banner** (its data collection needs UK/EU opt-in), which alone disqualifies it; (2) the raw
  interface is a maze for a non-technical user. The one foolproofing path — a simplified
  Looker Studio dashboard on top — is build-and-maintain work we'd own *and still needs the
  banner*: more work for a worse privacy outcome. Reconsider only if the project later needs
  something Plausible can't do (deep Google Ads attribution, say) **and** accepts a banner.

---

## 2. The retargeting pixel — a deliberate either/or

This gates the "Retargeting pixel" P1 leftover in [`ROADMAP.md`](./ROADMAP.md). A Meta or
TikTok **retargeting pixel is a marketing cookie / cross-site identifier**, which under UK/EU
GDPR + ePrivacy/PECR requires **explicit opt-in consent before it fires**. Banner-free
analytics gives **no** head start — the pixel is a separate legal category — and **server-side
("Conversions API") tracking does not exempt you**: sending the same personal data from the
Worker still needs consent. So it's an either/or, not a free add-on:

- **(A) Stay banner-free** — cookieless analytics only, **no retargeting pixel**. Recommended
  (and the default): simplest, cleanest, on-brand, and the enquiry/flash funnels are short
  enough that retargeting's payoff is marginal for a one-artist studio.
- **(B) Run retargeting** — accept and build a **consent banner** (a consent manager that
  blocks the pixel until "Accept"; the cookieless analytics keeps running regardless since it
  needs no consent). A real project, not a snippet.

---

## 3. Wiring plan (when we turn it on)

The codebase is already shaped for this — one function fill, one `<head>` snippet, one CSP
edit. **No module other than `analytics.js` changes.**

### 3.1 The events already wired

`track(event, props)` is the single instrumentation point and the conversion moments already
call it (no-op until a provider is in `send()`):

| Event | Props | Fired from |
|---|---|---|
| `enquiry_submit` | `{ type }` (tattoo type) | `apps/web/src/js/modules/enquire.js` |
| `flash_claim` | `{ piece }` | `apps/web/src/js/modules/flash.js` |
| `newsletter_signup` | `{ already }` | `apps/web/src/js/modules/newsletter.js` |
| `social_click` | `{ network, location }` | `apps/web/src/js/modules/analytics.js` (auto-wired to all IG/TikTok links by `initAnalytics()`, called from `main.js`) |

In dev, every event already logs to the console (`analytics.js:18`), so the wiring is
verifiable **before** shipping a tracker to real visitors.

### 3.2 Fill `send()` (the only code change)

`send()` is currently a dev-only console log (`analytics.js:15-19`). To enable Plausible,
forward to its global:

```js
function send(event, props) {
  if (import.meta.env.DEV) console.debug('[track]', event, props || {})
  // Plausible (cookieless): custom events map straight to track() events.
  window.plausible?.(event, props ? { props } : undefined)
}
```

(The scaffold's header comment documents the Fathom and GA4 equivalents — `analytics.js:9-13`
— if the provider choice changes. Errors are already swallowed by the `try/catch` in
`track()`, so a tracker outage can never break the UX.)

### 3.3 Add the provider snippet to every page `<head>`

**Preferred: a build-time injector**, matching how the repo already injects palette, SEO,
security and loader tags via Vite plugins (`apps/web/vite.config.js`). Add a tiny plugin that
injects the Plausible `<script defer data-domain="…" src="…/script.js">` into each page's
`<head>` (and into `apps/web/src/build/piece-page.js`, which bypasses the HTML transform —
same pattern the security/loader injectors follow). Gate it on the **production/apex** build so
the staging preview and dev don't send hits. (Hand-pasting per page works but drifts and is
easy to miss on a new page — prefer the plugin.) The script's own custom-event support makes
`window.plausible(...)` from §3.2 work with no extra config.

### 3.4 CSP — the one allowlist edit

The strict `<meta>` CSP is built in `apps/web/src/build/security.js`. Widen **two** directives
to the provider's origin — for Plausible's managed cloud (`plausible.io`): **`script-src`**
(loads the tracker `script.js`) and **`connect-src`** (the tracker POSTs events). Leave
`default-src 'self'` as the backstop; touch nothing else. If we **self-host** Plausible CE on
our own subdomain, allowlist that instead (same-origin may need no widening at all). Reminder:
the CSP is **build/preview only** — verify with `npm run build && npm run preview`, not
`npm run dev`.

### 3.5 Privacy page

Cookieless analytics needs only a **brief, honest line** on the privacy page ("we use
Plausible, a privacy-first analytics tool that uses no cookies and collects no personal data")
— no consent UI. Keep this in step with `docs/DATA-COMPLIANCE.md`. (If retargeting is ever
added per §2 option B, the privacy page *and* a consent banner become mandatory.)

---

## 4. Instagram feed — build-time static snapshot

Gates the "Instagram feed embed" P1 leftover in [`ROADMAP.md`](./ROADMAP.md). Constraints:
low-maintenance, no cookie banner, no token rot. The 2026 landscape rules out the easy paths —
the Basic Display API is **dead** (shut down Dec 2024); a *live* feed now needs a
Business/Creator account on the **Graph API** with a token refreshed ~every 30 days or the feed
silently breaks (over-engineered here); and **third-party widgets** typically load a script
that sets its own cookies, reintroducing the banner question.

**Recommendation: a build-time static snapshot.** A small set of curated Instagram images,
committed and rendered at build time — no live API, no token, no third-party script, no
cookies, **no banner**. It slots straight into the existing architecture: process the images
through `apps/web/scripts/process-media.mjs` (see `docs/MEDIA.md`), add an `instagram.js` data
file + a small `src/build/` renderer + an `<!-- instagram:grid -->` marker — the same
data → build-time HTML pattern as `pieces.js`/`flash.js`. Each tile links to the real post,
and those clicks are **already tracked** as `social_click` by `initAnalytics()`.

The honest cost: it's a snapshot, refreshed on the same cadence as portfolio updates — a few
minutes per content drop vs a banner + a 30-day token that breaks when missed. **Revisit** the
Graph API only if a genuinely live feed becomes a requirement *and* the account is already
Business/Creator — and even then weigh it against simply linking out to Instagram.

---

## Sources

- Plausible — data policy / cookieless / no-banner: https://plausible.io/data-policy ·
  https://plausible.io/privacy-focused-web-analytics · shared links (the foolproof view):
  https://plausible.io/docs/shared-links · Community Edition (self-host, AGPLv3):
  https://plausible.io/self-hosted-web-analytics
- Fathom — cookieless / no consent banner & shared dashboards:
  https://usefathom.com/why-fathom-analytics/gdpr-compliant-analytics ·
  https://usefathom.com/docs/features/shared-dashboards
- Retargeting pixels need consent (Meta/TikTok; CAPI doesn't exempt):
  https://www.flowconsent.com/en/blog/meta-pixel-cookies-gdpr-compliance ·
  https://www.webtoffee.com/blog/tiktok-pixel-gdpr-compliance/
- Instagram embedding (Basic Display EOL, Graph API tokens, widgets):
  https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/

*Pricing and tier figures are 2026 vendor- or third-party-reported — re-confirm on the
vendor's own pricing page before purchase.*

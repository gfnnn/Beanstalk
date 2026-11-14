# Analytics: GA4, statistics only, banner-free

The decision record and runbook for site measurement, plus the two P1 leftovers it gates
("Retargeting pixel", "Instagram feed embed") in [`ROADMAP.md`](./ROADMAP.md).

> Status: **shipped on staging** (code live, inert until the staging Measurement ID is set in
> `apps/web/src/data/analytics.js`). Production stays a no-op until cutover
> ([`CUTOVER.md`](./CUTOVER.md)).

---

## 1. The decision and why

**Google Analytics 4**, loaded directly as `gtag.js` (no GTM, no npm dependency, no build
step), measuring the two outcomes that matter: **enquiries** (and flash claims) and
**newsletter sign-ups**.

This **reverses** the earlier record here (Plausible decided, GA4 rejected because it needed a
consent banner). What changed: the UK **Data (Use and Access) Act 2025** amended PECR so a
cookie used **only to collect statistics to improve your own site** needs no prior consent,
provided visitors get **clear information** and a **simple, free way to object**. That removes
GA4's disqualifying banner, and GA4 is free.

**Accepted risk, on the record:** commentators disagree on whether GA4 can rely on that
exemption, because Google may reuse the data unless its sharing settings are off (which can
make it look like a joint controller rather than a processor). We mitigate in code and in
admin (below) and keep the data purely for our own statistics; **Plausible remains the
zero-risk fallback** (cookieless, no exemption needed) if a legal review says otherwise. The
privacy wording is pending that review (`PRIV-05`, `COPY-REVIEW.md`).

### What the code guarantees (`apps/web/src/js/modules/analytics.js`)
- **Runtime hostname → ID** from `src/data/analytics.js`: staging hosts (`gfnnn.github.io`,
  `beanstalk-e61.pages.dev` + its branch previews) → staging ID; `beansprout.ink`/`www` →
  production ID (**empty until cutover**); anything else (localhost, unknown) → no script.
  An empty ID means no script, no errors.
- **Opt-out before load:** Global Privacy Control, a saved opt-out (the control on `/privacy/`),
  or unreadable storage all mean gtag is never injected and no `dataLayer` exists: zero Google
  requests. Opting out mid-visit sets `window['ga-disable-<ID>']`, stops events and expires the
  `_ga` cookies; the choice persists (localStorage) and can be reversed.
- **gtag config:** `allow_google_signals: false`, `allow_ad_personalization_signals: false`,
  `cookie_expires` ≈ 13 months.
- **No PII, enforced centrally:** `track()` sends only an allowlist (events + fixed param
  values); anything else is dropped. Call sites never touch gtag.
- **Two properties:** staging and production are separate GA4 properties (separate IDs
  in the data file), so test traffic never mixes with real numbers. The production ID stays
  empty until cutover (X7b).
- **CSP** (`src/build/security.js`) widened only to Google's GA4 host set: `script-src
  www.googletagmanager.com`; `img-src`/`connect-src` `*.google-analytics.com`,
  `*.analytics.google.com` (connect only), `*.googletagmanager.com`.

### Events (fired only on a successful Worker response, never on the submit click)

| Event | Params | Fired from |
|---|---|---|
| `page_view` | GA4 default (page URL/title; URLs carry no PII, the only query string is `?style=`) | gtag `config` |
| `generate_lead` | `{ form: 'enquiry' }` | `enquire.js` (waits up to 800 ms for the hit before redirecting) |
| `generate_lead` | `{ form: 'flash' }` | `flash.js` |
| `sign_up` | `{ method: 'newsletter' }` (not fired for an already-subscribed address) | `newsletter.js` |

Outbound clicks come from GA4 enhanced measurement (the old `social_click` custom event is
gone). Payments events (`begin_checkout`/`purchase`) wait for `PAYMENTS_ENABLED`.

### 👤 GA4 admin setup (owner, per property)
1. Create the property + web stream; paste its `G-…` ID into `src/data/analytics.js`.
2. **Admin → Data collection:** Google signals **off**; granular location/device data **off**.
   **Account → Data sharing settings:** all **off**. Accept the Data Processing Terms.
3. **Data retention:** 14 months.
4. **Enhanced measurement:** keep page views, scrolls, outbound clicks; turn **off** *Form
   interactions* (fires on failed/invalid submits, double-counts) and *Site search* (no search
   exists; it would read `q`/`s` from any crafted URL).
5. **Internal traffic:** define the rule and add the data filter. **Staging: leave it in
   *Testing*** (staging traffic is almost all internal, so an *Active* filter would hide the
   very hits you're verifying). **Production: set it *Active*.**
6. **Custom dimension:** register an **event-scoped** dimension for the `form` param
   (`enquiry` | `flash`) so `generate_lead` can be split by form. `sign_up`'s `method` needs
   nothing: it maps to GA4's built-in *Method* dimension.
7. **Data redaction** (web stream → *Redact data*): turn on **email** redaction and add the
   query parameter **`payment_intent_client_secret`**. Nothing sends either today; this is
   belt-and-braces for the future Payment Element return URL (see `PAYMENTS.md` §7).
8. Production only (cutover): mark `generate_lead` and `sign_up` as **key events**.

Verify on staging with GA4 **DebugView/Realtime**: `page_view`, `generate_lead`, `sign_up`.

---

## 2. The retargeting pixel — a deliberate either/or

This gates the "Retargeting pixel" P1 leftover in [`ROADMAP.md`](./ROADMAP.md). A Meta or
TikTok **retargeting pixel is a marketing cookie / cross-site identifier**, which under UK/EU
GDPR + ePrivacy/PECR requires **explicit opt-in consent before it fires**. Banner-free
analytics gives **no** head start (GA4's statistics exemption doesn't cover advertising) — the pixel is a separate legal category — and **server-side
("Conversions API") tracking does not exempt you**: sending the same personal data from the
Worker still needs consent. So it's an either/or, not a free add-on:

- **(A) Stay banner-free** — statistics-only analytics, **no retargeting pixel**. Recommended
  (and the default): simplest, cleanest, on-brand, and the enquiry/flash funnels are short
  enough that retargeting's payoff is marginal for a one-artist studio.
- **(B) Run retargeting** — accept and build a **consent banner** (a consent manager that
  blocks the pixel until "Accept"; the statistics-only analytics keeps running regardless).
  A real project, not a snippet.

---

## 3. Instagram feed — build-time static snapshot

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
and those clicks are counted by GA4's outbound-click measurement.

The honest cost: it's a snapshot, refreshed on the same cadence as portfolio updates — a few
minutes per content drop vs a banner + a 30-day token that breaks when missed. **Revisit** the
Graph API only if a genuinely live feed becomes a requirement *and* the account is already
Business/Creator — and even then weigh it against simply linking out to Instagram.

---

## Sources

- ICO, storage and access technologies after the DUAA (statistics exemption, objection
  route): https://ico.org.uk/media2/mufgyf25/mind-your-banners-the-icos-approach-to-sats.pdf
- Google, GA4 CSP host set: https://developers.google.com/tag-platform/security/guides/csp
- Google, disabling measurement (`ga-disable-<ID>`):
  https://developers.google.com/analytics/devguides/collection/ga4/disable-analytics
- Global Privacy Control: https://globalprivacycontrol.org/
- Plausible (the fallback): https://plausible.io/data-policy
- Retargeting pixels need consent (Meta/TikTok; CAPI doesn't exempt):
  https://www.flowconsent.com/en/blog/meta-pixel-cookies-gdpr-compliance ·
  https://www.webtoffee.com/blog/tiktok-pixel-gdpr-compliance/
- Instagram embedding (Basic Display EOL, Graph API tokens, widgets):
  https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/

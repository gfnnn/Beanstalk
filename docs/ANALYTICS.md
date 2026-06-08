# Analytics — privacy-first measurement for Beansprout

How (and whether) we measure the site, written for a **non-technical artist** and a
**no-cookie-banner** house rule. The short version: a tiny cookieless analytics tool
(**Plausible**, recommended) gives the artist the four or five numbers that actually
matter, with **no consent banner owed**, and plugs into the `track()` scaffold that's
already in the codebase. **GA4 is out** unless its two costs (a banner + ongoing
dashboard work) are explicitly accepted. **Retargeting pixels are a separate, opt-in
decision that *does* force a banner** — so they trade against this whole strategy.

This doc is the decision record for the open Phase-0 item in
[`ROADMAP.md`](./ROADMAP.md) ("Analytics vendor") and the two P1 leftovers it gates
("Retargeting pixel", "Instagram feed embed").

> Status: **proposed / not yet wired.** The `track()` scaffold
> (`apps/web/src/js/modules/analytics.js`) deliberately no-ops in production, so the
> live site ships **launch-legal with no tracker and no banner** today. Nothing here is
> a launch blocker — it's the post-launch "turn measurement on" plan.

---

## 1. What the artist actually gets (plain language)

You don't need to "learn analytics." Once a cookieless tool is switched on, you open
**one web page** (a private link we send you — no login, no account, no Google maze) and
see a single clean dashboard. The numbers worth caring about, in order:

- **Visitors** — how many real people looked at the site this week/month, and the
  trend (up or down). One big number.
- **Top pages** — what they actually looked at. Expect `/portfolio/`, `/flash/`, and
  the individual piece pages to lead. This tells you which work pulls people in.
- **Where they came from** — Instagram, Google search, TikTok, a direct type-in, a
  link someone shared. This is the one that answers "is my Instagram doing anything?"
- **Conversions (the events that matter to a tattoo business)** — counted
  automatically, because the site already fires them:
  - **Enquiry submitted** — someone sent a custom-tattoo enquiry.
  - **Flash claimed** — someone claimed a flash design.
  - **Newsletter signup** — someone joined the list.
  - **Social click** — someone clicked through to your Instagram/TikTok.
- **Roughly where in the world / what device** — UK vs not, phone vs desktop. Useful,
  not essential.

That's the whole job. No funnels to configure, no reports to build, no jargon. If a
month's enquiries dip, you can see whether *fewer people visited* or *the same people
visited but didn't enquire* — which is the only "analytics question" a one-artist studio
ever really needs to answer.

**Why not "just use Instagram's own insights?"** Those only cover Instagram. They can't
tell you that someone found you on Google, read three portfolio pages, and then enquired.
The site analytics see the whole journey *on the website*; Instagram insights see only
the Instagram half.

---

## 2. Plausible vs Fathom — and the recommendation

Both are the same *category*: tiny, **cookieless, privacy-first** analytics built as the
"simple, ethical GA4 alternative." Both mean **no cookie banner** for analytics, both
keep EU visitor data in the EU, and both are night-and-day simpler than GA4. You will not
go wrong with either. The differences are at the margins.

| | **Plausible** *(recommended)* | **Fathom** |
|---|---|---|
| Cookieless / no banner | Yes — no cookies, no IP stored (daily-rotating salted hash), no cross-site tracking; UK ICO & France's CNIL have confirmed this style of analytics needs no consent | Yes — same model: no cookies, no personal data, "no consent banner required under GDPR/ePrivacy/PECR" |
| Dashboard simplicity | One clean page; built for exactly the "few numbers that matter" use-case | One clean page; arguably *the* slickest single-screen dashboard |
| **Share with the artist** | **Public or private shared link — viewer needs no account and no login** (the foolproofing win, see §3) | Shared dashboard link, optionally **password-protected**; viewer also needs no account |
| Custom events (our conversions) | Yes — `window.plausible(name, {props})`; events count against the plan | Yes — `window.fathom.trackEvent(name)`; ecommerce/events + API on every tier |
| EU data residency | EU by default (managed hosting in Germany) — *vendor-stated* | EU isolation available — EU visitor data processed in Frankfurt — *vendor-stated* |
| Script weight | Sub-1KB tracker (vendor/3rd-party-reported ~1–1.2KB) | ~1–2KB (vendor/3rd-party-reported) |
| Pricing (2026, entry) | from **~$9/mo** for ~10k pageviews (pageviews + events combined) — *third-party-reported* | from **~$15/mo** for ~100k pageviews — *third-party-reported* |
| **Self-host escape hatch** | **Yes — Plausible Community Edition, free, AGPLv3, self-hostable** (community-supported) | **No** — managed SaaS only |

**Recommendation: Plausible.**

1. **The shared-link is the foolproofing mechanism** (see §3). A non-technical artist
   gets a URL that opens straight to the dashboard — no Google account, no login, nothing
   to forget. Fathom does this too, but Plausible's public/private link is the cleanest
   fit for "send the artist one link, done."
2. **It's the cheaper entry tier** for a site at our (modest, pre-apex) traffic.
3. **The self-host option is on-brand and a genuine exit.** This repo already runs its
   own Worker + D1 and cares about data residency; if we ever want zero third-party
   anything, Plausible CE (AGPLv3) means we can host the analytics ourselves with no
   vendor at all. Fathom can't be self-hosted — you're a customer forever.

Fathom is a perfectly good pick if its dashboard or password-protected sharing is
preferred — this is a close call, not a landslide. Either one satisfies the brief.

---

## 3. The non-technical "foolproof view" — and the honest GA4 verdict

**The hard requirement: the artist must be able to *read* the numbers without technical
help.** That single requirement is what settles the GA4 question.

**Plausible/Fathom solve it natively.** Both expose a **read-only shared dashboard link**
the viewer can open **without an account and without logging in**. We set it up once and
hand the artist one bookmark. There is no second tool, no maintenance, nothing to break.
That is the foolproof view.

**GA4 — the honest verdict: out of scope, as expected.** Two reasons, in order of
severity:

1. **It needs a cookie banner.** GA4 sets cookies / collects data that, in the UK/EU,
   requires opt-in consent — which means adding the consent banner this whole strategy is
   built to avoid. That alone disqualifies it under the "no banner where possible" rule.
2. **Raw GA4 is genuinely hard for a non-technical user.** The default GA4 interface is a
   maze for anyone who isn't doing it daily — exactly the opposite of "open one link, see
   five numbers."

**Is there *any* foolproofing path for GA4? One, and it doesn't escape #1.** You can hide
GA4's complexity behind a **simplified Looker Studio dashboard**: a free Google tool that
connects to GA4 and presents a clean, drag-built page of just-the-numbers, shareable
read-only — non-technical-friendly *to read*. From a template, a basic dashboard is
~30–60 minutes to build. **But:**
- It still requires the **consent banner** (the GA4 data collection underneath is
  unchanged) — so it fails the house rule regardless of how pretty the front-end is.
- It's **build-and-maintain work we'd own** — a dashboard to design, keep working through
  GA4/Looker changes, and re-share — versus Plausible/Fathom's link that needs none.

**So:** GA4 is only worth reconsidering if the project later *needs* something Plausible/
Fathom can't do (deep Google Ads attribution, say) **and** accepts a consent banner. For
"give the artist the numbers that matter, no banner," GA4-via-Looker-Studio is **more
work for a worse privacy outcome**. Don't adopt it for this goal.

---

## 4. The no-banner / consent reality (and retargeting)

**Why no banner is achievable for analytics.** A consent banner is legally required to
set **non-essential cookies / store identifiers** on a visitor's device. Plausible and
Fathom set **no cookies** and store **no personal data** — UK ICO and France's CNIL have
publicly accepted that cookieless, no-PII analytics doesn't need consent. So switching one
on adds **zero** consent burden. (This is also why the scaffold's header note says "there's
nothing to consent to until [a provider] is" — `apps/web/src/js/modules/analytics.js:6-7`.)

**The retargeting pixel is the opposite, and this is the un-fun truth to be honest about.**
A Meta or TikTok **retargeting pixel is a marketing cookie / cross-site identifier** whose
entire job is to follow visitors to show them ads later. Under UK/EU GDPR + ePrivacy/PECR,
that requires **explicit opt-in consent before it fires**. Two consequences:

- **Adding retargeting forces the consent banner** the cookieless-analytics choice was
  specifically made to avoid. Banner-free analytics gives you **no** head start here — the
  pixel is a separate legal category.
- **Server-side ("Conversions API") tracking does not exempt you.** Sending the same
  personal data to Meta/TikTok from the Worker instead of the browser still needs a lawful
  basis/consent — losing the *cookie* doesn't lose the *obligation*.

**Recommendation on retargeting:** treat it as a **deliberate either/or**, not a free
add-on. Either:
- **(A) Stay banner-free** — cookieless analytics only, **no retargeting pixel**
  (recommended for a one-artist studio: simplest, cleanest, on-brand, and the enquiry/
  flash funnels are short enough that retargeting's payoff is marginal); **or**
- **(B) Run retargeting** — accept and build a **consent banner** (a consent manager that
  blocks the pixel until "Accept", and keeps the cookieless analytics running regardless
  since it needs no consent). This is a real project, not a snippet.

Keep "Retargeting pixel (P1 leftover)" parked behind this choice in `ROADMAP.md`. The
default is **(A)**.

---

## 5. Wiring plan (when we turn it on)

The codebase is already shaped for this — it's a one-function fill plus one `<head>`
snippet plus one CSP line. **No module other than `analytics.js` changes.**

### 5.1 The events already wired

The `track(event, props)` call is the single instrumentation point and the conversion
moments already call it (no-op until a provider is in `send()`):

| Event | Props | Fired from |
|---|---|---|
| `enquiry_submit` | `{ type }` (tattoo type) | `apps/web/src/js/modules/enquire.js` |
| `flash_claim` | `{ piece }` | `apps/web/src/js/modules/flash.js` |
| `newsletter_signup` | `{ already }` | `apps/web/src/js/modules/newsletter.js` |
| `social_click` | `{ network, location }` | `apps/web/src/js/modules/analytics.js` (auto-wired to all IG/TikTok links by `initAnalytics()`, called from `main.js`) |

In dev, every event already logs to the console (`analytics.js:18`), so you can verify
the wiring **before** shipping a tracker to real visitors.

### 5.2 Fill `send()` (the only code change)

`send()` is currently a dev-only console log (`apps/web/src/js/modules/analytics.js:15-19`).
To enable Plausible, forward to its global:

```js
function send(event, props) {
  if (import.meta.env.DEV) console.debug('[track]', event, props || {})
  // Plausible (cookieless): custom events map straight to track() events.
  window.plausible?.(event, props ? { props } : undefined)
}
```

(The scaffold already documents the Fathom and GA4 equivalents in its header comment —
`analytics.js:9-13` — if the provider choice changes. Errors are already swallowed by the
`try/catch` in `track()`, so a tracker outage can never break the UX.)

### 5.3 Add the provider snippet to every page `<head>`

Every page loads the same shell, so the snippet goes in one shared place. Two options,
in order of preference for *this* build:

- **Preferred — a build-time injector**, matching how the repo already injects palette,
  SEO, security and loader tags via Vite plugins (`apps/web/vite.config.js`). Add a tiny
  plugin that injects the Plausible `<script defer data-domain="…" src="…/script.js">`
  into each page's `<head>` (and into `apps/web/src/build/piece-page.js`, which bypasses
  the HTML transform — same pattern the security/loader injectors already follow). Gate it
  on the **production/apex** build so the staging preview and dev don't send hits.
- Simpler stopgap: paste the snippet by hand into each page `<head>`. Workable but drifts
  from the "one source of truth" pattern and is easy to miss on a new page — prefer the
  plugin.

Use the script's **own custom-event support** so `window.plausible(...)` from §5.2 works;
no extra config needed for our four events.

### 5.4 CSP — the one allowlist edit

The site ships a strict `<meta>` CSP built in `apps/web/src/build/security.js`. A
third-party tracker needs **two** directives widened to the provider's origin — for
Plausible's managed cloud (`plausible.io`):

- **`script-src`** (currently `'self'` only) → add `https://plausible.io` (the tracker
  `script.js` is loaded from there).
- **`connect-src`** (currently `'self'` + the Worker origin) → add `https://plausible.io`
  (the tracker POSTs events there).

Leave `default-src 'self'` as the backstop; touch nothing else. If we **self-host**
Plausible CE on our own subdomain, the allowlisted origin becomes that subdomain instead —
and if it's same-origin, the CSP may not need widening at all. (Reminder: the CSP is
**build/preview only** — dev runs without it — so verify the allowlist with
`npm run build && npm run preview`, not `npm run dev`.)

### 5.5 Privacy page

Cookieless analytics collects no personal data and sets no cookies, so it needs only a
**brief, honest line** on the privacy page ("we use Plausible, a privacy-first analytics
tool that uses no cookies and collects no personal data") — no consent UI. Keep this in
step with `docs/DATA-COMPLIANCE.md`. (If retargeting is ever added per §4 option B, the
privacy page and a consent banner become mandatory, not optional.)

---

## 6. Instagram feed — the sub-plan

Gated as a P1 leftover ("Instagram feed embed") behind a mechanism choice. The constraints
are the same as everywhere else: **low-maintenance, no cookie banner, no token rot.**

### The landscape (2026)

- **Instagram Basic Display API was permanently shut down (Dec 2024).** The old
  "personal account → simple feed" path is dead. Any *live* API feed now needs a
  **Business/Creator account** via the **Instagram Graph API**, with an access token that
  must be **refreshed roughly every ~30 days** or the feed silently breaks.
- **Third-party widgets** (SnapWidget, EmbedSocial, Elfsight, etc.) are the "no-code"
  route — connect the account, paste an embed. But they typically load a **third-party
  script that sets its own cookies**, which reintroduces a **consent-banner** question and
  an external dependency.
- **Native single-post embed** is fine for spotlighting *one* post, not a live grid.

### The three options, weighed

| Option | Maintenance | Cookies / banner | Tokens | Fit here |
|---|---|---|---|---|
| **Static snapshot at build time** *(recommended)* | Low — refresh on the same cadence as portfolio updates | **None** — it's just our own images/HTML | **None** | **Best** |
| Third-party widget | Lowest *day-to-day*, but external dependency | **Usually sets third-party cookies → likely a banner** | Handled by the vendor | Conflicts with the no-banner rule |
| Graph API (self-built live feed) | High — token refresh ~every 30 days, caching, rate limits | None *if* server-side, but it's real engineering | **Business/Creator account + refreshing token** | Over-engineered for a one-artist studio |

### Recommendation: build-time **static snapshot**

A small set of curated Instagram images, **committed and rendered at build time** — no
live API, no token, no third-party script, no cookies, **no banner**. It slots straight
into this repo's existing architecture:

- Run the chosen images through the existing **`apps/web/scripts/process-media.mjs`**
  pipeline (responsive AVIF/WebP/JPG, metadata stripped — see `docs/MEDIA.md`), exactly
  like portfolio/flash stills.
- Add an `instagram.js` **data file** (caption + link + image base path per post) as the
  single source of truth, a small renderer in `src/build/`, and a `<!-- instagram:grid -->`
  marker on the target page — the same **data → build-time HTML** pattern documented in
  `CLAUDE.md` (`pieces.js`/`flash.js` etc.).
- Each tile links out to the real post on instagram.com — and those clicks are **already
  tracked** as `social_click` by `initAnalytics()`, with no extra work.

The cost is honest: the grid is a **snapshot**, not auto-updating — refresh it when
portfolio images are refreshed (a natural cadence for a studio that ships work in batches).
For a non-technical artist that trade — a few minutes per content drop vs. a banner + a
30-day token that breaks the feed when missed — is the right one.

**Revisit** the Graph API only if a genuinely *live*, always-current feed becomes a
requirement *and* the account is already Business/Creator — and even then, weigh it
against simply linking out to Instagram, which costs nothing and sets no cookies.

---

## Sources

- Plausible — data policy / cookieless / no-banner: https://plausible.io/data-policy ·
  https://plausible.io/privacy-focused-web-analytics
- Plausible — shared/public dashboard links (the foolproof view):
  https://plausible.io/docs/shared-links
- Plausible — Community Edition (self-host, AGPLv3): https://plausible.io/self-hosted-web-analytics ·
  https://github.com/plausible/analytics
- Fathom — cookieless / no consent banner & shared dashboards:
  https://usefathom.com/why-fathom-analytics/gdpr-compliant-analytics ·
  https://usefathom.com/docs/features/shared-dashboards
- Retargeting pixels need consent (Meta/TikTok; CAPI doesn't exempt):
  https://www.flowconsent.com/en/blog/meta-pixel-cookies-gdpr-compliance ·
  https://www.webtoffee.com/blog/tiktok-pixel-gdpr-compliance/
- GA4 + Looker Studio for non-technical users: https://twominutereports.com/ga4-to-looker-studio
- Instagram embedding (Basic Display EOL, Graph API tokens, widgets):
  https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/

*Pricing, script-size and EU-residency figures are 2026 vendor- or third-party-reported
and should be re-confirmed on the vendor's own pricing/docs page before purchase.*

# Analytics: GA4, statistics only, banner-free

The runbook for site measurement: what the code guarantees, the events it sends, and the
GA4 admin setup.

> Status: **shipped on staging** (code live, inert until the staging Measurement ID is set in
> `apps/web/src/data/analytics.js`). The site is live on the apex, but production stays a no-op
> until its Measurement ID is set ([`CUTOVER.md`](./CUTOVER.md) → X7b).

**Constraint:** GA4 loaded directly as `gtag.js` (no GTM, no npm dependency, no build step),
statistics only, no consent banner, with an opt-out (the control on `/privacy/` plus Global
Privacy Control). Don't add anything that breaks one of those without a new decision.

---

## What the code guarantees (`apps/web/src/js/modules/analytics.js`)
- **Runtime hostname → ID** from `src/data/analytics.js`: staging hosts (`gfnnn.github.io`,
  `beanstalk-e61.pages.dev` + its branch previews) → staging ID; `beansprout.ink`/`www` →
  production ID (**empty until X7b**); anything else (localhost, unknown) → no script.
  An empty ID means no script, no errors.
- **Opt-out before load:** Global Privacy Control, a saved opt-out (the control on `/privacy/`),
  or unreadable storage all mean gtag is never injected and no `dataLayer` exists: zero Google
  requests. Opting out mid-visit sets `window['ga-disable-<ID>']`, stops events and expires the
  `_ga` cookies; the choice persists (localStorage) and can be reversed.
- **gtag config:** `allow_google_signals: false`, `allow_ad_personalization_signals: false`,
  `cookie_expires` ≈ 13 months.
- **No PII, enforced centrally:** `track()` sends only an allowlist (events + fixed param
  values); anything else is dropped. Call sites never touch gtag.
- **Owner flag:** a browser opted in with `?owner=1` sends `traffic_type: 'internal'` on every
  hit, and the `owner` param is taken off the URL before gtag is configured (see *Owner
  traffic* below).
- **Two properties:** staging and production are separate GA4 properties (separate IDs
  in the data file), so test traffic never mixes with real numbers. The production ID stays
  empty until the production property exists (`CUTOVER.md` → X7b).
- **CSP** (`src/build/security.js`) widened only to Google's GA4 host set: `script-src
  www.googletagmanager.com`; `img-src`/`connect-src` `*.google-analytics.com`,
  `*.analytics.google.com` (connect only), `*.googletagmanager.com`.

## Events (fired only on a successful Worker response, never on the submit click)

| Event | Params | Fired from |
|---|---|---|
| `page_view` | GA4 default (page URL/title; URLs carry no PII, the only query string is `?style=`; `?owner=` is stripped first) | gtag `config` |
| `generate_lead` | `{ form: 'enquiry' }` | `enquire.js` (waits up to 800 ms for the hit before redirecting) |
| `generate_lead` | `{ form: 'flash' }` | `flash.js` |
| `sign_up` | `{ method: 'newsletter' }` (not fired for an already-subscribed address) | `newsletter.js` |

Outbound clicks come from GA4 enhanced measurement (the old `social_click` custom event is
gone). Payments events (`begin_checkout`/`purchase`) wait for `PAYMENTS_ENABLED`.

## 👤 GA4 admin setup (owner, per property)
1. Create the property + web stream; paste its `G-…` ID into `src/data/analytics.js`.
2. **Admin → Data collection:** Google signals **off**; granular location/device data **off**.
   **Account → Data sharing settings:** all **off**. Accept the Data Processing Terms.
3. **Data retention:** 14 months.
4. **Enhanced measurement:** keep page views, scrolls, outbound clicks; turn **off** *Form
   interactions* (fires on failed/invalid submits, double-counts) and *Site search* (no search
   exists; it would read `q`/`s` from any crafted URL).
5. **Internal traffic:** keep the built-in *Internal Traffic* data filter (it excludes
   `traffic_type` = `internal`, which is what the owner flag sends; no IP rule is needed).
   **Staging: leave it in *Testing*** (staging traffic is almost all internal, so an *Active*
   filter would hide the very hits you're verifying). **Production: set it *Active*.** Don't
   use the *Developer traffic* filter for this: it keys off `debug_mode`.
6. **Custom dimension:** register an **event-scoped** dimension for the `form` param
   (`enquiry` | `flash`) so `generate_lead` can be split by form. `sign_up`'s `method` needs
   nothing: it maps to GA4's built-in *Method* dimension.
7. **Data redaction** (web stream → *Redact data*): turn on **email** redaction and add the
   query parameter **`payment_intent_client_secret`**. Nothing sends either today; this is
   belt-and-braces for the future Payment Element return URL (see `PAYMENTS.md` §7).
8. Production only (cutover): mark `generate_lead` and `sign_up` as **key events**.

Verify on staging with GA4 **DebugView/Realtime**: `page_view`, `generate_lead`, `sign_up`.

## 👤 Owner traffic (keep your own visits out of the numbers)

The flag lives in the browser, not the IP address, so it survives changing networks.

- **Opt in:** open `https://beansprout.ink/?owner=1` once in each browser you use. The address
  bar drops the `?owner=1` straight away and the footer shows *Owner mode · visits from this
  browser aren't counted* on every page while the flag is set.
- **Opt out:** open `https://beansprout.ink/?owner=0`.
- **Once per browser, per site.** Each browser on each device keeps its own flag, and staging
  and the live site are separate, so opt in on each. The Instagram in-app browser is its own
  browser too: open the link from inside Instagram (e.g. send it to yourself in a DM).
- **Check the footer if numbers look off.** Clearing site data removes the flag, a private
  window never has it, and Safari deletes it after seven days without a visit. No footer line
  means the flag is gone: open the opt-in link again.
- **Verify:** DevTools → Network → a `/g/collect` request carries `tt=internal` with the flag
  and no `tt` without it; your visit stays out of GA4 Realtime.

Anyone who finds the link only excludes their own visits, so it needs no secret.

---

## Sources

- Google, GA4 CSP host set: https://developers.google.com/tag-platform/security/guides/csp
- Google, disabling measurement (`ga-disable-<ID>`):
  https://developers.google.com/analytics/devguides/collection/ga4/disable-analytics
- Global Privacy Control: https://globalprivacycontrol.org/

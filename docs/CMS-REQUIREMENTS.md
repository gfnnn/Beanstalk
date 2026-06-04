# Content dashboard — requirements

**Status:** requirements capture, 2026-06-04. Companion to [CMS-FINDINGS.md](./CMS-FINDINGS.md) (which covers *which* tool). This doc covers *what Roxy needs to manage*. Not yet a design — it's the spec the design phase works from.

### Scope decisions (2026-06-04)
- **Testimonials = text only.** Managing client quote *text*, not uploading quote-card images. (Resolves §2.4.)
- **Filter management — deferred / out of scope.** Filters stay a fixed list; the dashboard only *assigns* existing style/placement tokens. Roxy to confirm later whether editable filters are a real need. (Resolves §2.1 filter item.)
- **Flash status — out of scope.** Status (`available`/`pending`/`claimed`) stays driven by existing functionality, not the dashboard. The dashboard covers flash upload + data only. (Resolves §2.2 status item.)
- **Visit home/guest — defined below but left as-is, out of scope.** The concept is documented in §2.9 for the future, but the data coupling + time-based switching automation is judged not worth it now; the Visit page stays hand-edited. (Resolves §2.9 guest mode.)
- **Palette matching — IN scope** (picking up the project health review = **PR #49**, merged). PR #49 centralised the palette into `apps/web/src/data/palette.js` with the rule *edit `palette.js`, never hard-code colour*. The dashboard's colour/swatch options bind to `palette.js`. Full requirement in §3. ✅ *Provenance resolved 2026-06-04: PR #49 (`claude/project-health-review-svrRo`). Note: this working copy predates that merge — `palette.js` is on `main`, not in this checkout yet.*

### Design decisions (2026-06-04)
- **Tool — Sanity.** Roxy logs in with email/Google (no GitHub account), best editor UX for a non-technical artist. Trade-off accepted: a hosted SaaS dependency on a free tier (vs the zero-cost Sveltia). See [CMS-FINDINGS.md](./CMS-FINDINGS.md).
- **Editors — Roxy only.** Single editor; no multi-user roles needed now.
- **Page editing — named fields**, not freeform rich text. Constrained fields per page so layout/design can't be broken by an edit.
- **Image upload — single file now, auto-derivatives later.** Roxy uploads one pre-sized export for now; responsive avif/webp/jpg generation is a later phase (cheap on Sanity — its asset pipeline can transform on the fly).
- **Header light — auto, top priority.** The highest-priority active announcement drives the nav status light automatically; no manual pinning. (§2.3)
- **Filters — fixed / assign-only** (confirmed, not just deferred). Roxy assigns existing style/placement tokens; the filter list is not editable from the dashboard. (§2.1)
- **Palette swatch — auto-suggest + override.** On upload the dashboard suggests the closest brand swatch from the image's dominant colour; Roxy confirms or changes it. (§3)

---

## 1. The key split: data-driven vs hand-authored

How easily each requirement lands depends entirely on whether the content is **already structured data** or **hand-authored HTML** today. This is the single most important framing for the build.

| Content | Source today | Already structured? |
|---|---|---|
| Portfolio | `apps/web/src/data/pieces.js` | ✅ Yes — array of records |
| Flash | `apps/web/src/data/flash.js` | ✅ Yes — array of records |
| Homepage status light + notice bars + hero | `apps/web/src/data/homepage.js` | ✅ Yes — structured object |
| Testimonials / quotes | `apps/web/src/data/testimonials.js` (shipped in PR #49-era work) | ✅ Yes — array of records |
| FAQ | hand-authored `.faq-item` markup in `faq/index.html` | ❌ No — markup |
| About | hand-authored `about/index.html` | ❌ No — markup |
| Services (+ pricing) | hand-authored `services/index.html` | ❌ No — markup |
| Aftercare | hand-authored `aftercare/index.html` | ❌ No — markup |
| Visit | hand-authored `visit/index.html` (Tiny Knives details) | ❌ No — markup |

**Consequence:** the ✅ rows are nearly free to expose in a dashboard — they already have a documented schema. The ❌ rows each need a **prerequisite refactor**: lift the content out of the HTML into a data file (the same pattern as `homepage.js`), wire it through a build renderer, *then* expose it in the dashboard. Budget that refactor per page, not just the dashboard field.

---

## 2. Requirements by module

Each block: what Roxy does · current data model · what the dashboard exposes · build work needed.

### 2.1 Portfolio — image & data management
**Roxy can:** add a piece (upload image + fill data), edit data, reorder, **hide**, **delete**, and manage the **filters**.

- **Model today** (`pieces.js`): `slug`, `title`, `subject`, `styles[]` (multi: fine-line·botanical·black-grey·illustrative·dotwork·colour·script), `placement` (forearm·wrist·back·spine·leg·chest·hand), `date` (drives newest-first order), `img` (+ `w`,`h`), placeholder `tone`/`glyph`.
- **Dashboard fields:** image upload; title; subject (feeds alt text); style multi-select; placement select; date; visibility toggle; **palette swatch (`tone`)** — see §3 Palette matching.
- **Hide:** *new field required* — there is no `hidden`/`show` flag today. Add one to the model + renderer so a piece can be unpublished without deleting it.
- **Delete:** remove the record (and ideally its image).
- **Filter management:** ⏸️ **out of scope (2026-06-04).** Filters stay a fixed list; Roxy only *assigns* the existing style/placement tokens to a piece (multi-select / select), she does not add or rename filters. Rationale: the tokens are coupled across three places — the data, the filter chips/`<select>` in the HTML, and the label maps in `src/build/portfolio-tiles.js` — so editable filters would mean driving all three from one source. Revisit only if Roxy confirms a real need.

### 2.2 Flash — drop & status management
**Roxy can:** upload a flash design, set its status, edit data, manage drops.

- **Model today** (`flash.js`): `id`, `title`, `specs` (size·placement·style caption), `price` (£), `size` (inches), `drop` (drop number — highest = current; lower = auto-archived to "Past drops"), `status` (`available`|`pending`|`claimed`), `img` (+`w`,`h`), placeholder `tone`/`glyph`.
- **Dashboard fields:** image upload; title; specs; price; size; drop number; **palette swatch (`tone`)** — see §3 Palette matching.
- **Status — ⏸️ out of scope (2026-06-04).** `available`/`pending`/`claimed` stays driven by the **existing functionality**, not the dashboard. The dashboard manages flash upload + the data fields above only; it does not set status. (This also removes the dashboard-vs-live-claim reconciliation question.)

### 2.3 Homepage alert system — the "moving parts" (status light + notice bars)
This is the "pick colour, pick slot, pick wording" requirement, and the model already mostly exists in `homepage.js`.

**Today there are two linked pieces:**
- **`status`** — the nav "light" pill shown on **every page** (the *header* element): `show`, `label`, `tone` (`moss` green / `clay` orange / `faint` grey).
- **`notices`** — up to 3 toggleable bars under the hero (homepage only): each `show`, `tone`, `label`, `html` (message, may contain a link). Examples already in place: Bookings, Flash day, Guest spot.

**Proposed dashboard shape (for design to confirm):**
- Manage a list of "announcements" (flash day, guest spot, books open, custom). Each is:
  - **Wording type** — preset (Bookings / Flash day / Guest spot) that pre-fills label + message template, or custom.
  - **Colour** — `moss` / `clay` / `faint` (pick from the 3 brand tones, not freeform, to stay on-palette).
  - **Slot / on-off** — show or hide; up to 3 visible bars.
  - **Message** — short copy, optional link.
- **Priority order** — rank the announcements. The bars render top-down in that order.
- **Header priority** — the **single highest-priority active** announcement drives the nav status light across all pages (auto-derive its `label` + `tone`), with an option for Roxy to override or pin which one feeds the header. This satisfies "pick which one gets priority for the header, a priority order for all."
- Hero copy (`eyebrow`, `headLead`, `headEm`, `body`, `mediaTag`) editable in the same homepage screen.

This module is the **best-fit, highest-value** target: data-driven already, changes often, and directly drives the most visible UI.

### 2.4 Testimonials / quotes
**Roxy can:** add / edit / remove / reorder client quotes.

- **Today:** ✅ already data-driven via `apps/web/src/data/testimonials.js` + renderer (shipped since this spec was first drafted; quote text + credit "Initial Last. · piece description"; max ~40 words; "do not fabricate").
- **Dashboard fields:** quote text; credit (initial + piece description); show/hide; order.
- **Scope:** ✅ **text only (confirmed 2026-06-04)** — entering/editing quote text + credit, no image upload.
- **Build work:** ✅ **no refactor needed** — the data file + renderer exist; just expose `testimonials.js` fields in the dashboard. This moves testimonials from the medium tier to the low tier in §4.

### 2.5 FAQ
**Roxy can:** add / edit / remove / reorder Q&A pairs.
- **Today:** hand-authored `.faq-item` accordion markup in `faq/index.html`; JS (`modules/faq.js`) is just the accordion behaviour and will work unchanged over generated items.
- **Dashboard fields:** question; answer (rich-ish text / links); order; show/hide.
- **Build work:** ❌ refactor FAQ items into a data file + renderer; accordion JS stays as-is.

### 2.6 About — simple page management
**Roxy can:** edit the about-page copy (and any artist photo).
- **Today:** hand-authored `about/index.html`.
- **Dashboard:** a small set of named rich-text/photo fields (not a freeform HTML box — keep it constrained so layout can't break).
- **Build work:** ❌ identify the editable regions, pull them into fields.

### 2.7 Services — content + pricing management
**Roxy can:** edit service descriptions and prices.
- **Today:** hand-authored `services/index.html`.
- **Dashboard:** likely a repeatable "service" item (name, description, price/from-price) + intro copy. Pricing is the part most likely to change.
- **Build work:** ❌ refactor to a `services.js` data file + renderer (repeatable items map cleanly to a CMS collection).

### 2.8 Aftercare — simple edits
**Roxy can:** edit aftercare copy.
- **Today:** hand-authored `aftercare/index.html`; `modules/aftercare.js` is behaviour only.
- **Dashboard:** named rich-text sections.
- **Build work:** ❌ lift copy into fields. Lowest-churn page — low priority.

### 2.9 Visit — home vs guest (defined, but ⏸️ left as-is / out of scope 2026-06-04)
Defined here for the future; **not** being built into the dashboard now — the Visit page stays hand-edited.

**The two states, defined:**
- **Home studio** — Roxy's permanent base and the page's normal state: **Tiny Knives, 41 Southgate St, Winchester SO23 9EH**; studio IG `@tinyknivestattoo`; "Women-owned / LGBTQ+ welcome" tags; map; hours (hours still pending from Roxy). Fixed block.
- **Guest spot** — a temporary period when Roxy tattoos at a *different* studio (a guest-artist arrangement). Would need that studio's **name, address, map, dates, and any links**, then a revert to Home afterwards.

**Why left as-is (the "could get messy" call):** switching between the two isn't just editing a field — it implies stateful, time-bound automation (the Visit page **and** ideally the homepage Guest-spot bar §2.3 **and** the nav light would need to change together on the start date and revert on the end date). That coupling + scheduling is disproportionate for what is likely one or two guest spots a year. For now, **hand-edit the Visit page** (and set a Guest-spot notice manually via §2.3) when it happens. Revisit if guest spots become frequent.

- ⚠️ **Map preview caveat (still relevant for any manual edit):** the dev sandbox blocks Google Maps tiles and screenshots time out on `/visit/`; verify any visit change via DOM geometry, not screenshots.

---

## 3. Cross-cutting requirements

- **Palette matching (brand-colour consistency).** *Picks up the earlier project health-review work — see provenance flag in Scope decisions.* Every colour choice in the dashboard is constrained to the brand palette; Roxy never gets a freeform colour wheel or hex field. Two places it applies:
  - **Alert colours** (status light + notice bars, §2.3): pick from the brand tones only — `moss` (green: normal / books open), `clay` (orange: something live), `faint` (grey: quiet / closed). `amber` is reserved for flash `pending` and isn't a Roxy-pickable option.
  - **Image swatch (`tone`).** Each image already carries a palette swatch shown behind/while it loads (and as the placeholder before a photo exists). Roxy picks the swatch that best matches the image's dominant colour, from the **fixed swatch sets** — portfolio: `t-moss · t-cream · t-ink · t-sage · t-clay · t-warm · t-deep · t-blush · t-stone · t-dark`; flash: `ci-moss · ci-sage · ci-cream · ci-warm · ci-blush · ci-ink · ci-deep · ci-clay`. **Confirmed (2026-06-04):** on upload the dashboard **auto-suggests** the closest swatch from the image's dominant colour, which Roxy confirms or overrides — palette matching becomes a one-tap confirm, not a manual judgement.
  - **Single source of truth:** the project health review (PR #49) centralised the palette into **`apps/web/src/data/palette.js`** with a standing rule — *edit `palette.js`, never hard-code colour* (documented in CLAUDE.md's design-system section). The dashboard's swatch/colour options **must be generated from `palette.js`**, so the picker is bound to the same single source as the site and can never drift off-brand. (`variables.css` consumes these tokens; `palette.js` is the source.)
- **Image pipeline.** Portfolio uses 700×930 `.webp`; flash uses square crops; both support responsive `<picture>` srcset (avif/webp/jpg) when derivatives exist. Decide where uploads land (repo `/public/images/...` for a git CMS, or a hosted media library for Sanity) and **whether the dashboard generates the responsive derivatives** or Roxy uploads a single export. `w`/`h` are required when an image is set (prevents layout shift) — the dashboard should capture or auto-read these.
- **Visibility everywhere.** A consistent **show/hide** flag across portfolio, flash, testimonials, FAQ, notices — unpublish without deleting. Only some models have it today; standardise it.
- **Ordering/priority everywhere.** Portfolio orders by `date`; flash by `drop`; notices need an explicit priority rank; testimonials/FAQ need a manual order. Decide per-collection: date-driven vs manual drag-order.
- **Preview vs publish latency.** A git-based CMS rebuilds (~1–2 min to live); fine here, but the dashboard should make "saved, publishing…" state clear so Roxy isn't confused when a change isn't instant.
- **Filter-token governance** (portfolio styles/placement, flash tokens): single source vs fixed list — see §4.

---

## 4. Complexity / effort ranking (for sequencing the build)

| Tier | Modules | Why |
|---|---|---|
| **Low — already data-driven** | Homepage alerts + hero (§2.3), Portfolio (§2.1, assign-only filters), Flash upload + data (§2.2, no status), Testimonials (§2.4 — `testimonials.js` shipped) | Schema exists; mostly UI over current data files. Highest value, do first. |
| **Medium — needs a refactor first** | FAQ (§2.5), Services (§2.7) | Lift hand-authored HTML into data files + renderers, then expose. Repeatable-item pages, so the easier refactors. |
| **Higher — design decisions** | Header-priority auto-light (§2.3) | The one coupled piece still in scope: which active announcement drives the nav light. Needs an explicit design before coding. |
| **Low priority** | About (§2.6), Aftercare (§2.8) | Lowest churn; do last. |
| **⏸️ Out of scope (2026-06-04)** | Filter management (§2.1), Flash status (§2.2), Visit home/guest (§2.9) | Deferred per scope decisions above — not in this build. |

---

## 5. Decisions log

**All design questions resolved 2026-06-04.** See the Scope decisions and Design decisions blocks at the top:
- Scope: quote = text only · filters out (assign-only) · flash status out · Visit home/guest out · palette matching in.
- Design: tool = **Sanity** · editors = Roxy only · editing = named fields · images = single now / auto later · header light = auto top-priority · filters = fixed/assign-only · swatch = auto-suggest + override.

**Health review reconciled (2026-06-04):** the review is **PR #49** (merged) — it centralised the palette into `apps/web/src/data/palette.js` with the *never hard-code colour* rule. §3 now binds the dashboard's colour/swatch options to `palette.js`. Its deferred follow-ups (palette visual QA, the 160°→155° gradient note, dev-only audit advisories) are tracked in the roadmap handoff (PR #50), not here.

---

## 6. Suggested first slice (when we design it out)

Ship the **homepage alert system + hero + portfolio + flash** first — they're already data-driven, change most often, and prove the whole dashboard loop (edit → save → rebuild → live) end-to-end. Then refactor and add the hand-authored pages (FAQ, services, testimonials, visit, about, aftercare) tier by tier.

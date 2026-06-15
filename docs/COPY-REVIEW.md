# Copy review — the one copy doc (artist worksheet + internal tracker)

**Purpose.** Every word on the public site that reads as **the artist speaking to a
visitor** must be confirmed as *their* words before go-live — not placeholder copy
written for them. This is the **single** copy doc: the artist-facing worksheet
(Part 2) and the internal tracker (Part 3) live together here, sharing one set of
refs (`HOME-03`, `VISIT-04`, …) and **one facts table** (Part 1) so the two halves
can never drift apart again.

> The aim is simple: **every sentence that sounds like the artist should actually
> be theirs.** Factual labels (nav, form field names, status chips, the address)
> don't need their sign-off and are listed in the tracker so you can see they were
> considered, not missed.

**The workflow:**

1. **The artist reads the staging site** like a visitor would — the draft wording
   is there so they have something to react to.
2. **They fill in their words in Part 2 below** (plain English, keyed by ref). 🔒
   facts go straight into the Part 1 table.
3. **The dev applies their words to source** (HTML page or `src/data/*.js` file —
   see the marker conventions below).
4. **The marker is flipped** (`pending approval` → `approved`), then **stripped**
   before the apex cutover.

**The gate:** the copy pass is done when

```bash
grep -rn "pending approval" apps/web/ --exclude-dir=dist --exclude-dir=node_modules
```

returns **nothing**. (17 markers remain as of 2026-06-15 — the still-open sections
listed under "Where things stand".)

## Where things stand

- **Round 1 landed (2026-06-08, #155).** The artist reviewed everything **up to the
  enquiry form** and gave the global tone/style/fact decisions; those words are in
  source and the reviewed sections' markers are flipped + stripped. Applied
  globally: "custom"→"bespoke", "tattooer"→"tattoo artist", em dashes stripped from
  visible copy (incl. JS UI strings). Switched off for go-live: the About **stats**
  (ABOUT-04) and **"The space"** (ABOUT-05).
- **Round 1.5 (#179):** hours, getting-there and booking lead time confirmed.
- **Round 2 (2026-06-15):** **reply time** confirmed, and **newsletter, visit, portfolio
  and the small pages confirmed** — their markers are stripped, the enquiry-received
  "we→I" voice is fixed, and the **404 was reworked** (real brand mark + de-cheesed copy).
- All confirmed **values** live in [the facts table](#part-1--facts-i-need-from-you) — the
  only place they're written down here.
- **Still open (~17 markers):** flash page + season + the 12 pieces (FLASH, FLASH-D1/D2)
  · ICO public reference + tattoo-reg (PRIV/TERMS) + the legal review · consent wording
  (ENQ-07) + ENQ-06 voice · testimonials
  (DATA-TEST, HOME-08) · the off slots (ABOUT-04 stats, HOME-10 / DATA-MEDIA video).

## How the refs map to source (conventions)

Each artist-voice block in the codebase carries an inline marker tying it to a ref
in this document:

```html
<!-- ARTIST-COPY · HOME-03 · pending approval — see docs/COPY-REVIEW.md -->
```

- **Grep the gate:** `grep -rn "ARTIST-COPY" apps/web/` lists every block still
  flagged; the ref ties the marker to this doc.
- As wording is approved, flip `pending approval` → `approved` on the marker and
  tick the row in the sign-off checklist (Part 3).
- **These markers are HTML/JS comments and ship into the built page source** —
  they're a *staging* review aid (staging is `noindex`). **Strip them entirely
  before the apex go-live** (see `docs/ROADMAP.md`).
- **Generated copy lives in data files, not the HTML.** The homepage hero,
  specialism cards, flash cards, testimonials and portfolio tiles are built from
  `apps/web/src/data/*.js`. Edit the data file — never the rendered markup. Tracker
  rows point at the data file where that applies.

---

# Part 1 — Facts I need from you

🔒 facts aren't writing — just the real numbers/details. **This table is the only
place fact values are recorded in this doc**; the worksheet and tracker link here
instead of repeating them, so a value can never drift.

| 🔒 | What | Was on the site (placeholder) | The real value |
|----|------|-------------------------------|----------------|
| Reply time | How long you take to reply to an enquiry | "within 3 days" | ✅ **Confirmed: within 3 days** |
| Prices | Min / small / half-day / full-day | £120 / £180–280 / £420 / £680 | ✅ **£80 / £120–£200 / £300 / £500** |
| Deposit | (was Standard / half-day / full-day) | £60 / £120 / £200 | ✅ **Flat 50% of the price** |
| Touch-up window | Free touch-up valid for… | 6 months | ✅ **1 year** |
| Reschedule notice | Notice needed to move a booking | 72 hours | ✅ **48 hours** |
| Hours | Days + times you work | "Tue–Sat · 11am–6pm" | ✅ **Tue–Sat · 11am–6pm** confirmed (#179) |
| Getting there | Walk from station / parking | "short walk… paid parking nearby" | ✅ **confirmed** (#179) |
| Booking lead time | How far ahead you're usually booking | "3–4 weeks" | ✅ **~3–4 weeks** confirmed (#179) |
| Your stats | Years tattooing / pieces healed | "6 yrs / 900+" | ✅ **8 yrs** confirmed (rest TBC; the stats block is **switched off** for go-live) |
| Style categories | The three styles you lead with | (was fine line / black & grey / colour) | ✅ **Fine line · High detail · Realism** |
| Flash | Next flash day + the season + 12 names/sizes/prices | "Summer 2026" + placeholders | ⏳ **Next flash day 26 July** set; season label + the 12 pieces still to confirm |
| Legal dates | Effective date for Privacy + Terms | "June 2026" | ✅ **Approved (June 2026)** |
| Trading name + insurance | Legal pages' "who I am" / liability | blanks | ✅ **"Beansprout Tattoo"** + **public liability insurance** confirmed |
| ⚖️ ICO number | Your ICO registration reference (**ZA######**) | blank | ⏳ held — need the **public ZA###### reference** (not the account/certificate number) |
| ⚖️ Tattoo reg | Winchester City Council registration number | blank | _still to confirm_ |

---

# Part 2 — Your words, please (the artist's worksheet)

Hi 👋 This part is for **the artist** behind Beansprout. Making sure every sentence
on the site that sounds like *you* is actually in *your* words, not a stand-in
written to fill the space, is the one job only you can do.

You don't need to touch any code. Here's the whole process:

1. **Open the site in your browser** (I'll send you the link). Read it like a
   visitor would — the draft wording is there so you've got something to react to.
2. **Go through this list.** For each item you'll see three things:
   - **What it's for** — what that bit of text is doing on the page.
   - **Example** — a plain, simple version, just to show the *kind* of thing that
     goes there (not a suggestion to copy — yours will be better).
   - **Your words** — write your version on the blank line. If the wording on the
     site is already spot-on, just write **"keep"**.
3. **Send it back to me** and I'll put your words into the site.

A few notes:
- Write however you'd actually talk to someone in the studio. Plain is good.
- Don't worry about length, spelling or formatting — I'll tidy the layout.
- **🔒 = a fact, not writing.** Prices, hours, dates — those go in
  [the facts table above](#part-1--facts-i-need-from-you); each section just points there.
- **⚖️ = legal wording.** Write it however you like, but I'll also get these
  checked properly before launch — don't stress the exact phrasing.

> **Quick wins first?** If you only have ten minutes, do the 🔒 blanks in
> [the facts table](#part-1--facts-i-need-from-you) — those unblock the most.

## Already done — thank you (Round 1, 2026-06-08 + the #179 follow-up)

We went through everything **up to the enquiry form** together; your words and
facts from that session are live on the site. Nothing more needed for these unless
you want to tweak something later — just name the ref:

- **Home:** HOME-01 status pill · HOME-02 notices · HOME-03 hero · HOME-04 style
  cards (your three categories — see facts table) · HOME-05 "Recent work" ·
  HOME-06 "Three things I love" · HOME-07 the 4 "how it works" steps · HOME-09
  buttons. (HOME-08 "Kind words" stays hidden until there are real quotes — see
  CONFIRM/testimonials below.)
- **About:** ABOUT-01 intro · ABOUT-02 your story · ABOUT-03 happiest / not-my-thing
  lists · ABOUT-06 closing nudge. ABOUT-04 stats and ABOUT-05 "The space" are
  **switched off** for launch (stats → facts table).
- **Services:** SERV-01 intro · SERV-02 pricing cards · SERV-03 deposits box ·
  SERV-04 what's included · SERV-05 cover-ups & touch-ups · SERV-06 closing line
  (all £ figures → facts table).
- **FAQ:** FAQ-01 intro · FAQ-03 all 17 Q&As (two added: "what should I avoid
  after a tattoo?" and "are you registered and insured?") · FAQ-05 closing line.
- **Aftercare:** AFTER-01 intro · AFTER-02 wrap chooser · AFTER-03/AFTER-04 the
  step-by-steps · AFTER-05 "keep in mind" rules · AFTER-06 closing line — all in
  first person now, brand names dropped. ⚠️ These are health instructions; if how
  you wrap or what you recommend ever changes, tell me and I'll update them.
- **Enquiry form:** ENQ-01 intro · ENQ-03 "my promise" + what-happens-next ·
  ENQ-04/ENQ-05 field prompts · ENQ-06 booking lead time (→ facts table) · ENQ-08
  buttons. (ENQ-07 consent wording is still open — below.)
- **Sitewide:** SHARED-01 footer brand line · SHARED-03 the main button.

## Still to do — your words needed

Everything from here down is still open.

## Enquiry form (one bit left)

### ENQ-07 — Consent checkboxes ⚖️
**What it's for:** the three tick-boxes at the end of the enquiry form (health
declaration, deposit/cancellation agreement, photo permission). The
deposit/cancellation wording needs your OK — figures → facts table.
**Your words (or "keep"):**
>

## Contact & visit

### VISIT-01 / VISIT-02 — Intro + heading
**Example:** "I tattoo from Tiny Knives in Winchester — here's where to find it."
**Your words:**
>

### VISIT-04 — Hours & getting there 🔒 + words
**Hours / getting-there** → [facts table](#part-1--facts-i-need-from-you).
**Bookings note (words):** "Bookings are by enquiry only…" — keep / change:
>

### VISIT-05 — "What to expect on the day"
**What it's for:** 5–6 practical points about visiting (stairs/access, ID, breaks,
deposit). **Make these match how you actually run a session.**
**Your words (corrections):**
>

## Flash page

### FLASH-01 — Intro 🔒 + words
**Example:** title "Flash, ready to claim." + "Pre-drawn designs, each tattooed
only once." **Season label** → [facts table](#part-1--facts-i-need-from-you) ("Flash" row).
**Your words (intro):**
>

### FLASH-D2 — The flash pieces 🔒
**What it's for:** each flash card needs a name, size, placements and price. The 12
on the site now are placeholders (status → facts table, "Flash" row).
**Your real flash list** (name · size · placements · price), one per line:
>

### FLASH-03 / FLASH-04 / FLASH-05 — Empty state, CTA, claim form
**What it's for:** the "all claimed" message, the "nothing right? go custom" line,
and the prompts in the claim pop-up.
**Your words (any to change):**
>

## Portfolio

### PORT-01 — Intro
**Example:** title "Things I've made." + "A selection of healed and fresh work."
**Your words:**
>

### PORT-D1 — Piece names
**What it's for:** every portfolio piece has a short name (shown on hover and as
its page title). I named them from what they show — check you're happy with them.
**Your words:** review on the site; list any names to change here:
>

### PORT-03 — "No results" message
**Example:** "No pieces match those filters. Try a different style or placement."
**Your words:** _______________

## Newsletter

### NL-01 / NL-02 — Intro + pitch
**What it's for:** title + what people get by signing up (3 short points) +
frequency reassurance.
**Example:** "First look at flash drops, a heads-up when books open, and the odd
note from me. A few times a month at most."
**Your words:**
>

### NL-03 / NL-04 — Signup card + success message
**Example:** "Join the list — pop your email in below." / "You're on the list —
thanks for signing up."
**Your words:**
>

### NLBAND-01 — The newsletter strip (home / flash / after enquiring)
**What it's for:** the small signup band that repeats on a few pages.
**Example:** "New work & flash, before anywhere else."
**Your words:**
>

## Smaller pages

### CONFIRM-01 — "Enquiry received" page
**What it's for:** the thank-you page after someone sends an enquiry.
**Example:** "Thanks — your enquiry's on its way. I'll reply by email, usually
within [reply time]."
**Note from me:** the steps here currently say *"We"* — everywhere else you say
*"I"*. I'll switch these to "I" unless you'd rather it read as "we".
**Your words:**
>

### E404-01 — "Page not found" page
**What it's for:** the friendly message when a link is broken.
**Example:** "This page has gone to seed. Try one of these instead."
**Your words:**
>

## Legal pages ⚖️

Write these however you like — I'll get the final wording checked against UK law
before launch, so don't worry about getting it legally perfect. The 🔒 bits I need
(ICO ZA###### reference, tattoo-reg number, effective dates) →
[facts table](#part-1--facts-i-need-from-you).

### PRIV — Privacy policy ⚖️
**What it's for:** what data you collect and how you handle it.
**Words — anything in the plain-English summary you'd phrase differently?**
>

### TERMS — Terms of service ⚖️
**What it's for:** the booking agreement (deposits, cancellations, age/ID, health,
photos, liability). Deposit figures will match your Services prices.
**Words — anything to change?**
>

## The brand line (appears in the footer of every page)

### SHARED-01
**What it's for:** the one-line description under your name in the footer, sitewide.
**Example:** "Fine line, botanical and custom tattoo at Tiny Knives, Winchester."
**Your words:** _______________

*That's everything. Send this back however's easiest — typed here, scribbled,
voice note, whatever works — and I'll get it all into the site. Thank you!*

---

# Part 3 — Internal tracker

### Status legend

| Tag | Meaning |
|-----|---------|
| 🟡 **Voice** | Reads as the artist. Needs them to confirm/rewrite in their own words. |
| 🟠 **Placeholder** | A sensible default written *for* the artist (price, date, reply time, stats). Real value → [facts table](#part-1--facts-i-need-from-you). Carries a `TODO(artist)` / `COPY:` note in source. |
| 🔵 **Legal** | Artist-voice *and* legally operative. Needs the artist's words **and** a professional/legal review before launch. |
| 🟣 **Testimonial** | A client's words, not the artist's. Must be a real, approved quote — never fabricated. |
| ⚪ **Factual** | Label/UI/contact fact. No sign-off needed (listed for completeness). |
| ✅ | Approved + applied in source; marker flipped/stripped. |

### Voice-consistency flags

First-person "I" is the chosen voice. Aftercare's "we recommend"/"ask us" was
resolved in Round 1 (first-person throughout; second-skin brand names dropped).
The one remaining slip is **CONFIRM-01** (`enquiry-received/index.html` — "We read
through your idea…", not yet reviewed).

### Where each ref lives

Locations are file-level (line numbers drift); generated copy rows point at the
data file, never the rendered markup. Worksheet sections above describe what each
slot *is*; this table only adds source location + anything tracker-specific.

| Ref | Type | Source | Tracker notes |
|-----|------|--------|---------------|
| SHARED-01 | ✅ 🟡 | footer `.tagline`, every page | Approved: "Fine line, high detail and realism…" |
| SHARED-02 | 🟡 | footer link label (`Visit` column) | "Find me" → `/visit/` |
| SHARED-03 | ✅ 🟡 | hero / drawer / mobile sticky CTA, sitewide | "Start an enquiry →" |
| SHARED-04 | ⚪ | nav links | Home · Portfolio · Flash · About · Services · FAQ · More · Aftercare · Contact & visit · Newsletter · Enquire |
| SHARED-05 | ⚪ | footer headings + contact | Explore / Visit / Follow · Instagram · `hello@beansprout.ink` · "© Beansprout 2026 · Winchester, UK" |
| SHARED-06 | 🟡 | `src/build/newsletter-inline.js` | = NLBAND-01 (shared band on home / flash / enquiry-received) |
| HOME-01..09 | ✅ 🟡 | `src/data/homepage.js` (01–04, generated) + `index.html` (05–09) | Round 1 approved + stripped — except HOME-08 (hidden until DATA-TEST) |
| HOME-10 | 🟠 | `homepage.js` `videoCredit` | `@handle` film credit — off until a real video + credit are confirmed |
| ABOUT-01..03, 06 | ✅ 🟡 | `about/index.html` | Round 1 approved + stripped |
| ABOUT-04 | 🟠 | `about/index.html` credentials block | **Switched off** for go-live (→ facts table, "Your stats") |
| ABOUT-05 | 🟡 | `about/index.html` "The space" | **Switched off** for go-live |
| SERV-01..06 | ✅ 🟡/🟠 | `services/index.html` | Round 1 approved + stripped; figures → facts table; keep TERMS-03 aligned |
| FAQ-01, FAQ-02, FAQ-03, FAQ-04, FAQ-05 | ✅ 🟡 | `faq/index.html` (FAQ-02 ⚪ category labels; FAQ-04 the "no matches" empty state) | Round 1 approved + stripped; now 17 Q&As (two added) |
| AFTER-01..06 | ✅ 🟡 | `aftercare/index.html` | Round 1 approved + stripped; health-critical — re-read on any edit; voice settled |
| ENQ-01, ENQ-02, ENQ-03, ENQ-04, ENQ-05, ENQ-08 | ✅ 🟡 | `enquire/index.html` (ENQ-02 the "four short steps" progress intro; ENQ-08 step buttons) | Round 1 approved + stripped |
| ENQ-06 | ✅ 🟠 | `enquire/index.html` step 3 | Lead-time hint confirmed (#179, → facts table) |
| ENQ-07 | 🔵 | `enquire/index.html` step 4 | Health/consent hints + photo permission + 3 consent checkboxes — **deposit/cancellation consent wording still open** |
| ENQ-09 | ⚪ | `enquire/index.html` | Input placeholders ("Jane" / "you@email.com"); the *idea*/notes placeholders are 🟡 (covered by ENQ-05) |
| VISIT-01, 02 | 🟡 | `visit/index.html` header | Still open |
| VISIT-03 | ⚪ | `visit/index.html` | Address (41 Southgate Street, SO23 9EH) + studio tags "Women-owned" / "LGBTQ+ friendly" — confirm still accurate |
| VISIT-04 | ~🟡 | `visit/index.html` contact rows | Hours + getting-there ✅ (→ facts table); email/Instagram ⚪; "Bookings are by enquiry only…" voice **still open** |
| VISIT-05 | 🟠+🟡 | `visit/index.html` access block | 6 access/prep points incl. "up a flight of stairs, not step-free" — match how a session actually runs |
| FLASH-01 | 🟠+🟡 | `flash/index.html` header | Drop number auto-derived from data; season label → facts table; intro voice open |
| FLASH-02 | ⚪ | `flash/index.html` filter bar | All / Available / Claimed / Past drops + sort |
| FLASH-03..05 | 🟡 | `flash/index.html` (empty state, custom CTA, claim modal) | Copy applied; review with the real drop |
| FLASH-D1 | 🟠 | `src/data/flash.js` `season` | → facts table ("Flash" row) |
| FLASH-D2 | 🟠 | `src/data/flash.js` pieces | 12 placeholder names/specs/prices until a real drop (→ facts table) |
| PORT-01, PORT-02, PORT-03, PORT-04 | ✅ 🟡/⚪ | `portfolio/index.html` | Round 1 approved (incl. the 3 style categories); PORT-02 + PORT-04 ⚪ filter / count + load-more UI |
| PORT-D1 | 🟡 | `src/data/pieces.js` titles | 28 piece names ("Good dog", "The Lovers"…) — **still to confirm** |
| PORT-D2 | ⚪/🟡 | `pieces.js` `subject` field | Feeds alt text; SEO/a11y — skim for accuracy |
| PIECE-01 | 🟡 | `src/build/piece-page.js` | Per-piece CTAs "Enquire about a piece like this →" / "See more work" |
| NL-01..04 | 🟡 | `newsletter/index.html` | Still open |
| NLBAND-01 | 🟡 | `src/build/newsletter-inline.js` | Still open (one renderer → three pages) |
| CONFIRM-01 | 🟡 | `enquiry-received/index.html` | Still open + the "We"→"I" voice flag; quotes reply time (BUS-01) |
| E404-01 | 🟡 | `404.html` | Still open |
| PRIV-01, PRIV-02, PRIV-03, PRIV-04 | 🔵/🟠 | `privacy/index.html` | Trading name confirmed (PRIV-03); ICO + tattoo-reg refs → facts table; **legal review due**; PRIV-02 effective date approved |
| TERMS-01, TERMS-02, TERMS-03 | 🔵/🟠 | `terms/index.html` | Trading name + liability insurance confirmed (TERMS-03); TERMS-02 effective date approved; keep deposit figures aligned with SERV-03; **legal review due** |
| BUS-01 | 🟠 | `src/data/business.js` `replyTime` | "within 3 days" — set real turnaround (updates `/enquire/` + `/enquiry-received/` together) |
| DATA-TEST | 🟣 | `src/data/testimonials.js` | Empty array — add **real, approved** quotes, then remove `hidden` on HOME-08. Never fabricate. |
| DATA-MEDIA | 🟠 | `src/data/media.js` | Hero-clip `alt` text — confirm once real video lands |

### Sign-off checklist

> Round 1 (#155) + #179: ticked sections have the artist's approved words in source
> **and** their `ARTIST-COPY` markers flipped + stripped; open sub-items inline.

- [x] SHARED-01 brand line + SHARED-03 CTA
- [~] Homepage (HOME-01..07, 09 stripped); HOME-08 testimonials + HOME-10 video credit still off
- [~] About (ABOUT-01..03, 06 stripped); ABOUT-04 stats + ABOUT-05 space switched off
- [x] Services (SERV-01..06) + real prices/deposits
- [x] FAQ (FAQ-01..05) — now 17 Q&As
- [x] Aftercare (AFTER-01..06) + voice consistency settled
- [~] Enquire (ENQ-01..06, 08 done); ENQ-07 consent wording still open
- [~] Visit — VISIT-04 facts confirmed (#179); VISIT-01..03, 05 voice still open
- [ ] Flash (FLASH-03/04/05 copy applied) — **real drop data/photos still open** (FLASH-D1/D2)
- [~] Portfolio (PORT-01..04 + the 3 style categories); **piece names (PORT-D1) still to confirm**
- [ ] Newsletter (NL-01..04, NLBAND-01)
- [ ] Enquiry received (CONFIRM-01 voice) + 404 (E404-01) + piece pages (PIECE-01)
- [~] Privacy + Terms — names/insurance/dates done; **legal review + ICO/tattoo-reg** still open
- [ ] Reply time (BUS-01) + testimonials (DATA-TEST) + media alt (DATA-MEDIA)
- [ ] The gate: `grep -rn "pending approval" apps/web/ --exclude-dir=dist --exclude-dir=node_modules` returns nothing (32 as of 2026-06-09)

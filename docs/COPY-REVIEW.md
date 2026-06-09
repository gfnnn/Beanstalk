# Copy review — pre-launch sign-off

**Purpose.** Every word on the public site that reads as **the artist speaking to a
visitor** must be confirmed as *their* words before go-live — not placeholder copy
written for them. This document is the working list for that pass: go through it,
edit the copy in place (or in the source), and tick each row off once the artist has
approved the wording.

> The aim is simple: **every sentence that sounds like the artist should actually
> be theirs.** Factual labels (nav, form field names, status chips, the address)
> don't need their sign-off and are listed separately so you can see they were
> considered, not missed.

> **This file is the internal tracker.** The **artist-facing** companion is
> [`COPY-FOR-ARTIST.md`](./COPY-FOR-ARTIST.md) — the same slots, but written as a
> plain "what it's for + a simple example + your words" worksheet the artist fills in
> against the staging site. The review loop is baked into the go-live plan
> (`ROADMAP.md` → Phase 4 → *Copy sign-off — the review loop*). Refs match across
> all three (e.g. `HOME-03`).

> **Update — Round-1 copy pass landed (2026-06-08, #155).** The artist reviewed the
> checklist **up to enquiries** and gave the global tone/style/fact decisions; those words
> are now in source. **Confirmed facts:** pricing **£80 / £120–£200 / £300 / £500**, a
> **flat 50% deposit**, **48h** reschedule, a **one-year** touch-up, flash day **26 July**,
> and the three style categories **fine line · high detail · realism** (replacing botanical/
> illustrative/custom). **Applied globally:** "custom"→"bespoke", "tattooer"→"tattoo artist",
> and em dashes stripped from visible copy (incl. JS UI strings). **Switched off for go-live:**
> the About **stats** (ABOUT-04) and **"The space"** (ABOUT-05). **Held:** the ICO number
> (need the public **ZA######** reference) + tattoo-reg (TBC); a legal review of privacy/terms
> is still due (effective dates "June 2026" are approved). **Markers:** the reviewed-section
> markers have been **flipped + stripped**; **33** remain for the still-open sections (stats,
> flash, visit, newsletter, legal, reply time, small pages). The per-row "Current text"
> snapshots below are **pre-pass** (kept for reference); the reviewed sections now hold the
> artist's approved words.

## How this maps to the source

Each artist-voice block in the codebase now carries an inline marker so nothing
ships unapproved:

```html
<!-- ARTIST-COPY · HOME-03 · pending approval — see docs/COPY-REVIEW.md -->
```

- **Grep the gate:** `grep -rn "ARTIST-COPY" apps/web/` lists every block still
  flagged. The ref (e.g. `HOME-03`) ties the marker to a row in this document.
- As wording is approved, change `pending approval` → `approved` on that marker
  (and tick the row here). When `grep -rn "pending approval" apps/web/` returns
  nothing, the copy pass is done.
- **These markers are HTML/JS comments and ship into the built page source**
  (they're a *staging* review aid — staging is `noindex`). Clear them as part of
  sign-off: flip `pending approval` → `approved` as copy lands, and strip the
  comments entirely before the apex go-live (Phase 6 — see `docs/ROADMAP.md`).
- **Generated copy lives in data files, not the HTML.** The homepage hero,
  specialism cards, flash cards, testimonials and portfolio tiles are built from
  `apps/web/src/data/*.js`. Edit the data file — never the rendered markup. Those
  rows point at the data file.

## Status legend

| Tag | Meaning |
|-----|---------|
| 🟡 **Voice** | Reads as the artist. Needs them to confirm/rewrite in their own words. |
| 🟠 **Placeholder** | A sensible default written *for* the artist (price, date, reply time, stats). Must be replaced with real figures, then approved. Already carries a `TODO(artist)` / `COPY:` note in source. |
| 🔵 **Legal** | artist-voice *and* legally operative. Needs the artist's words **and** a professional/legal review before launch. |
| 🟣 **Testimonial** | A client's words, not the artist's. Must be a real, approved quote — never fabricated. |
| ⚪ **Factual** | Label/UI/contact fact. No sign-off needed (listed for completeness). |

## At-a-glance: the hard blockers

These carry placeholder values that are **wrong until the artist sets them** — they're
the highest-priority rows:

- 🟠 Reply time — `within 3 days` (`src/data/business.js:19`) — **still open**
- ✅ Pricing + deposit figures — **set** (#155): £80 / £120–£200 / £300 / £500, flat 50% deposit, 48h, one-year touch-up
- ✅ Opening hours (**Tue–Sat · 11am–6pm**) + getting here (**short walk from station / paid parking nearby**) — **confirmed** (placeholders locked in; `visit/index.html`)
- ✅ About-page stats — **resolved** (#155): module switched off for go-live (8 yrs confirmed; rest TBC)
- 🟠 Flash season label `Summer 2026` + all flash names/specs/prices (`src/data/flash.js`) — **still open** (flash day **26 July** is set on the homepage notice)
- ✅ Booking lead time (**~3–4 weeks ahead**) — **confirmed** (placeholder locked in; `enquire/index.html`)
- 🔵 Legal: effective dates **approved** ("June 2026"); trading name **"Beansprout Tattoo"** + **public liability insurance** now **confirmed** (in `privacy`/`terms`); **ICO public ref** (ZA######) + **tattoo-reg** still needed (`privacy`, `terms`)

## Voice-consistency flags (for the artist to settle)

A few blocks slip between **"I"** (the artist, used everywhere else) and **"we"/"us"**:

- `enquiry-received/index.html` — *"We read through your idea…"* — **still open** (that page
  wasn't in the Round-1 review).
- ✅ `aftercare/index.html` — **resolved** (#155): "I recommend…", "ask me", first-person
  throughout; the second-skin brand names (Saniderm/Dermalize) were also dropped.

First-person "I" is the chosen voice; CONFIRM-01 is the one remaining slip.

---

# Shared components (appear on most/every page)

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| SHARED-01 | 🟡 Voice | footer `.tagline`, every page (e.g. `index.html:541`) | "Fine line, botanical and custom tattoo at Tiny Knives, Winchester." |
| SHARED-02 | 🟡 Voice | footer link label "Find me" (`Visit` column) | "Find me" → `/visit/` |
| SHARED-03 | 🟡 Voice | primary CTA, repeated sitewide | "Start an enquiry →" (hero, drawer, mobile sticky CTA) |
| SHARED-04 | ⚪ Factual | nav links | Home · Portfolio · Flash · About · Services · FAQ · More · Aftercare · Contact & visit · Newsletter · Enquire |
| SHARED-05 | ⚪ Factual | footer headings + contact | Explore / Visit / Follow · Instagram · `hello@beansprout.ink` · "© Beansprout 2026 · Winchester, UK" |
| SHARED-06 | 🟡 Voice | newsletter band (`src/build/newsletter-inline.js`) — see NLBAND-01 | shared across home / flash / enquiry-received |

> SHARED-01..03 are written once and repeat on ~14 pages. Approve the wording
> once and it's settled everywhere.

---

# Homepage — `index.html` + `src/data/homepage.js`

**Generated copy → edit `src/data/homepage.js`, not `index.html`.**

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| HOME-01 | 🟠 Voice | `homepage.js:67` `status.label` | "Books open" (nav status pill, every page) |
| HOME-02 | 🟡 Voice | `homepage.js:72–73` `notices[].html` | "Books are open for summer. Request a slot" · "New flash dropping soon. Preview the sheet" |
| HOME-03 | 🟡 Voice | `homepage.js:78–82` `hero` | eyebrow "Winchester · Fine line & botanical"; H1 "Quietly considered / *custom tattoo.*"; body (the first-person artist intro — "…the fine line, botanical and illustrative tattooer behind Beansprout, working out of Tiny Knives in Winchester. Custom pieces, drawn for one person, at a pace that never feels rushed."); media tag "Tiny Knives · Winchester" |
| HOME-04 | 🟡 Voice | `homepage.js:86–91` `specialisms` | fine-line "*precise*" + body; black-grey "*soft*" + body; colour "*vivid*" + body; dotwork(fill) "*textured*" + body |
| HOME-05 | 🟡 Voice | `index.html:332–333` | eyebrow "Recent work" + H2 "Fresh from the *chair.*" |
| HOME-06 | 🟡 Voice | `index.html:444–449` | eyebrow "What I do" + H2 "Three things I *love.*" + note "I keep my range tight on purpose. These are the styles I draw best and enjoy most." |
| HOME-07 | 🟡 Voice | `index.html:467–493` (process) | eyebrow "How it works" + H2 "From idea to *healed.*" + note "From your first message to your two-week check-in…" + 4 steps (Enquire / Design / Your session / Aftercare) with bodies |
| HOME-08 | 🟡 Voice | `index.html:511–512` (hidden) | "Kind words" + "What people *say.*" — section is `hidden` until testimonials exist |
| HOME-09 | 🟡 Voice | `index.html:173–174, 307` | CTA "View the portfolio" + "Scroll" hint |
| HOME-10 | 🟠 Placeholder | `homepage.js:94–99` `videoCredit` | `@handle` film credit — off until a real video + credit are confirmed |
| — | ⚪ Factual | `index.html:354–419` tile captions | piece names + "Fine line · Forearm" etc. — pulled from `pieces.js` (see PORT data) |

---

# About — `about/index.html`

The most voice-heavy page on the site. Every paragraph here is the artist's voice.

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| ABOUT-01 | 🟡 Voice | `:81–84` page header | eyebrow "The artist · Winchester" + H1 "Hi, I'm *[name].*" (the artist's first-name intro) + descriptor "I'm the hands and the name behind Beansprout…" |
| ABOUT-02 | 🟡 Voice | `:102–108` intro | eyebrow "Nice to meet you" + H2 "Tattoos that feel *like yours.*" + 3 bio paragraphs ("I've always been the person friends came to…" / "My work leans fine line and botanical…" / "Mostly, I want the chair to feel calm…") |
| ABOUT-03 | 🟡 Voice | `:118–146` approach | eyebrow "How I work" + H2 "What I take on, and what I *don't.*" + "Where I'm happiest" (6 items) + "Not really my thing" (6 items, incl. "A new partner's name (trust me on this one)") |
| ABOUT-04 | 🟠 Placeholder | `:153–169` credentials | "6 yrs / Tattooing", "900+ / Pieces healed", "1 / Client a day", "100% / Custom designs" — **confirm real figures** |
| ABOUT-05 | 🟡 Voice | `:176–181` studio | eyebrow "The space" + H2 "Where it *happens.*" + note "I work from a private room at Tiny Knives on Southgate Street — a calm, clean, daylit studio…" |
| ABOUT-06 | 🟡 Voice | `:215–217` CTA | H2 "Got something in *mind?*" + "Tell me the idea, however half-formed…" |

---

# Services — `services/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| SERV-01 | 🟡 Voice | `:98–104` header | eyebrow "Honest, in advance" + H1 "Pricing, *no surprises.*" + descriptor "I'd rather you knew the numbers before you enquired…" |
| SERV-02 | 🟠 Placeholder | `:114–177` pricing cards | "What it costs" / "Rates & *sessions.*" + 5 cards — **all £ figures are placeholders** (£120 min, £180–£280 small, £420 half-day, £680 full-day, free touch-up). Card titles, qualifiers + bodies are 🟡 Voice. |
| SERV-03 | 🟠 Placeholder | `:184–228` deposit aside | "Deposits & cancellations" / "Booking *& deposits.*" + rows (£60/£120/£200, 72h+, deposit forfeit, card or bank) + note "Your deposit secures the date…" — **figures placeholder; note is 🟡 Voice** |
| SERV-04 | 🟡 Voice | `:243–305` what's included | "Every booking" / "What's *included.*" + descriptor + 4 items (Consultation / Hand-drawn design / Aftercare pack / Two-week check-in) |
| SERV-05 | 🟡 Voice | `:315–342` policies | "The detail" / "Cover-ups & *touch-ups.*" + cover-ups card ("…some of my favourite jobs…") + touch-ups card ("One free touch-up… within six months…") |
| SERV-06 | 🟡 Voice | `:352–353` CTA | H2 "Know the numbers? *Let's talk.*" + "If the pricing works for you, send your idea over…" |

---

# FAQ — `faq/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| FAQ-01 | 🟡 Voice | `:79–82` header | eyebrow "FAQ" + H1 "Good *questions.*" + descriptor "The things I get asked most…" |
| FAQ-02 | ⚪ Factual | `:103–126` category labels | All questions / Before you book / On the day / Aftercare & healing / Pricing & deposits / Policies (+ counts) |
| FAQ-03 | 🟡 Voice | `:146–360` — **all 17 Q&As** | Questions + answers, e.g. "How far in advance do I need to book?", "Will it hurt?…", "I'm pregnant / breastfeeding / on medication…", "Are you registered and insured?", "Do you offer touch-ups?" — every answer is the artist's voice |
| FAQ-04 | 🟡 Voice | `:333–335` empty state | "No matches" + "Nothing here answers it. Try another word, or just ask me directly." |
| FAQ-05 | 🟡 Voice | `:345–346` CTA | H2 "Still *wondering?*" + "If your question isn't here, send it over…" |

---

# Aftercare — `aftercare/index.html`

Health-critical instructions **and** artist-voice — worth a careful read.

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| AFTER-01 | 🟡 Voice | `:102–109` header | eyebrow "Post-session" + H1 "After*care.*" + descriptor "How you look after your tattoo… shapes how it heals for the rest of your life. Start by telling us how it was wrapped." |
| AFTER-02 | 🟡 Voice | `:120–191` chooser | "Step one" + "How was your tattoo *wrapped?*" + sub + the two dressing cards (Second skin / Cling film, hints + descriptions) + "Not sure which you have?… ask us" |
| AFTER-03 | 🟡 Voice / Health | `:227–296` second-skin steps | aside note + 8 numbered steps (incl. "We recommend Palmer's Cocoa Butter") |
| AFTER-04 | 🟡 Voice / Health | `:312–369` cling-film steps | aside note + 7 numbered steps |
| AFTER-05 | 🟡 Voice / Health | `:384–420` general rules | "Both methods" + "Keep in *mind.*" + No soaking / Don't pick or scratch / Avoid direct sunlight |
| AFTER-06 | 🟡 Voice | `:433–434` CTA | H2 "Got a *question?*" + "…I check in at two weeks for exactly this reason." |

> ⚠️ "we recommend" / "ask us" here vs "I" elsewhere — see voice-consistency flag.

---

# Enquire — `enquire/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| ENQ-01 | 🟡 Voice | `:78–80` header | eyebrow "Bookings · By enquiry" + H1 "Let's make *something.*" + descriptor "Tell me what you have in mind and I'll get back to you personally…" |
| ENQ-02 | 🟡 Voice | `:92` progress intro | "Four short steps · about 2 minutes" |
| ENQ-03 | 🟡 Voice | `:115–129` aside | "My promise" + "Every enquiry comes straight to me. Never an agency, never a bot…" + "What happens next" 5-step timeline (incl. reply-time marker → BUS-01) |
| ENQ-04 | 🟡 Voice | `:170, 203, 211` step 1 | "First, a little *about you.*" + hint "I only tattoo over-18s. This just confirms it." + "How did you find me?" |
| ENQ-05 | 🟡 Voice | `:240, 260–274` step 2 | "Now, the *fun part.*" + radio hints ("Designed for you from scratch" / "One of my ready-to-go pieces" / "Help me figure it out") + "Tell me your idea" + hint + placeholder "I've been wanting a small botanical piece, maybe foxgloves and ferns…" |
| ENQ-06 | 🟡 Voice | `:365, 376, 399, 415` step 3 | "References *& timing.*" + image hint + cover-up hint + ✅ booking-lead hint "I'm usually booking about 3–4 weeks ahead…" **confirmed** |
| ENQ-07 | 🔵 Legal + 🟡 | `:455, 465–521` step 4 | "Health, consent *& the legal bit.*" + allergies/notes hints ("This stays private between us.") + photo-permission copy ("I love showing healed work, but only with your blessing…") + 3 consent checkboxes (`TODO(artist)` confirm deposit/cancellation wording) |
| ENQ-08 | 🟡 Voice | `:229, 354, 444, 532` | step buttons "Continue →" / "Send my enquiry" |
| ENQ-09 | ⚪ Factual | various | input placeholders "Jane" / "Smith" / "you@email.com" — but the *idea*/notes placeholders (ENQ-05, and `:477`) are 🟡 Voice |

---

# Contact & visit — `visit/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| VISIT-01 | 🟡 Voice | `:79–81` header | eyebrow "The studio" + H1 "Find me at *Tiny Knives.*" + descriptor "I tattoo from Tiny Knives, a studio in Winchester…" |
| VISIT-02 | 🟡 Voice | `:90–91` | H2 "Where to *find me.*" + "All my work happens at Tiny Knives in Winchester." |
| VISIT-03 | ⚪ Factual | `:93–103` | address (41 Southgate Street, SO23 9EH) + studio tags "Women-owned studio" / "LGBTQ+ friendly" (genuine Tiny Knives attributes — confirm still accurate) |
| VISIT-04 | 🟡 Voice | `:109–146` contact rows | ✅ Hours "Tue–Sat · 11am–6pm" **confirmed** · ✅ "A short walk from Winchester station / Paid parking nearby" **confirmed** · Email/Instagram ⚪ · 🟡 "Bookings are by enquiry only…" (still voice) |
| VISIT-05 | 🟠 Placeholder + 🟡 | `:180–189` access | "What to expect on the day" — 6 access/prep points (`TODO(artist)`: "tweak these so they match how you actually run a session"), incl. "The studio is up a flight of stairs and isn't step-free." |

---

# Flash — `flash/index.html` + `src/data/flash.js`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| FLASH-01 | 🟠 Placeholder + 🟡 | `:77–80` header | eyebrow "Drop N · *Season*" (number auto-derived; 🟠 season label from data) + H1 "Flash, ready *to claim.*" + descriptor "Pre-drawn designs, each one tattooed only once…" |
| FLASH-02 | ⚪ Factual | `:86–118` filter bar | All / Available / Claimed / Past drops + sort options |
| FLASH-03 | 🟡 Voice | `:150–151` empty state | "Nothing here right now" + "Every piece in this drop has found a home…" |
| FLASH-04 | 🟡 Voice | `:160` CTA | "Nothing quite right? *Custom is what I do most*. Tell me your idea and we'll draw something just for you." |
| FLASH-05 | 🟡 Voice | `:213, 245–255` claim modal | "Reserve this *piece.*" + "Where would it go?" + "When suits you?" ("I'll follow up with exact dates.") + placeholders + "Send my claim →" |
| FLASH-D1 | 🟠 Placeholder | `flash.js:41` | `season = 'Summer 2026'` (`TODO(artist)`) |
| FLASH-D2 | 🟠 Placeholder | `flash.js:47–58` | 12 flash names + specs + prices ("Wildflower sprig", "Luna moth"…) — placeholder set until a real drop |

---

# Portfolio — `portfolio/index.html` + `src/data/pieces.js`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| PORT-01 | 🟡 Voice | `:107–113` header | eyebrow "Selected work · Winchester" + H1 "Things I've *made.*" + descriptor "A selection of healed and fresh work… Tap any piece to see it larger." |
| PORT-02 | ⚪ Factual | `:138–201` filter bar | style chips + placement select + sort + "Clear" |
| PORT-03 | 🟡 Voice | `:245–246` empty state | "No work found" + "No pieces match those filters…" |
| PORT-04 | ⚪ Factual | `:259–273` | "Showing X of Y pieces" + "Load more work →" |
| PORT-D1 | 🟡 Voice | `pieces.js:56–115` | 56 piece **titles** (the artist's naming — "Good dog", "God's timing", "Storyteller", "The Lovers"…). Confirm the artist is happy with each. |
| PORT-D2 | ⚪/🟡 | `pieces.js` `subject` field | feeds alt text ("a koi carp", "a barn owl and chrysanthemums"); SEO/a11y, but the artist's descriptions — skim for accuracy |

> Per-piece pages (`/portfolio/<slug>/`) render the style/placement tags + CTAs
> (no descriptive caption) — see PIECE-01.

---

# Newsletter — `newsletter/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| NL-01 | 🟡 Voice | `:84–91` header | eyebrow "Newsletter" + H1 "The Beansprout *list.*" + descriptor "An occasional email. Never spam…" |
| NL-02 | 🟡 Voice | `:102–146` pitch | lead "Sign up and you'll be *first to know*…" + 3 points (Flash drops first / Books-open dates / Notes from me) + reassurance "A few times a month at most. Unsubscribe in one click…" |
| NL-03 | 🟡 Voice | `:153–188` signup card | "Join the *list.*" + "Pop your email in below. That's all it takes." + consent line + "We use your email only to send the newsletter. No sharing, no spam." |
| NL-04 | 🟡 Voice | `:199–200` success | "You're *on the list.*" + "Thanks for signing up. Keep an eye on your inbox." |

---

# Newsletter band (shared) — `src/build/newsletter-inline.js`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| NLBAND-01 | 🟡 Voice | `:19–22, 44, 55–56` | "The newsletter" + "New work & flash, *before anywhere else.*" + sub "Drops, fresh flash and the occasional studio note…" + consent + success "You're *on the list.*" |

---

# Enquiry received — `enquiry-received/index.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| CONFIRM-01 | 🟡 Voice | `:8, 73–96` | meta desc + eyebrow "Enquiry received" + H1 "Thank you, your enquiry's *on its way.*" + body "It's landed in my inbox… usually [reply-time]…" + timeline (3 steps — **"We read through…"**, see voice flag) + fallback "Didn't mean to send that…" |

---

# 404 — `404.html`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| E404-01 | 🟡 Voice | `:71–80` | eyebrow "Error 404" + H1 "This page has *gone to seed.*" + "The link's broken or the page has moved. Nothing's lost…" + "Looking for something specific? Email…" |

---

# Privacy — `privacy/index.html`  🔵 needs legal review

artist-voice ("I collect…") **and** legally operative. Confirm the wording is the artist's
*and* have a professional check it against UK GDPR before launch.

| Ref | Type | Location | Notes |
|-----|------|----------|-------|
| PRIV-01 | 🔵 Legal | `:84–91` header | eyebrow "Legal" + H1 "Privacy *policy.*" + plain-English descriptor |
| PRIV-02 | 🟠 Placeholder | `:105` | "Last updated: June 2026" — set real effective date on sign-off |
| PRIV-03 | 🔵 Legal | `:108–124` Who I am | Trading name **"Beansprout Tattoo"** **confirmed**; **[ICO REGISTRATION REFERENCE]** + **[TATTOO REGISTRATION NUMBER]** still to be filled (see in-source COPY notes) |
| PRIV-04 | 🔵 Legal | `:128–182` | What I collect / How I use it / Lawful basis / Retention / Sharing / Cookies & analytics / Your rights / Changes & contact |

---

# Terms — `terms/index.html`  🔵 needs legal review

| Ref | Type | Location | Notes |
|-----|------|----------|-------|
| TERMS-01 | 🔵 Legal | `:84–91` header | eyebrow "Legal" + H1 "Terms of *service.*" + descriptor |
| TERMS-02 | 🟠 Placeholder | `:105` | "Last updated: June 2026" |
| TERMS-03 | 🔵 Legal | `:108–160` | Booking & enquiries / Deposits / Cancellations / Age & ID / Health & suitability / Aftercare & touch-ups / Designs & copyright / Photography / Liability / Changes & contact — keep deposit figures aligned with SERV-03. Trading name **"Beansprout Tattoo"** + **public liability insurance** (Liability §) now **confirmed** |

---

# Per-piece pages (generated) — `src/build/piece-page.js`

| Ref | Type | Location | Current text |
|-----|------|----------|--------------|
| PIECE-01 | 🟡 Voice | `:180–183` | per-piece CTAs "Enquire about a piece like this →" / "See more work" |

---

# Data-file placeholders (consolidated 🟠)

| Ref | Location | Current value | Action |
|-----|----------|---------------|--------|
| BUS-01 | `src/data/business.js:19` | `replyTime = 'within 3 days'` | Set real reply turnaround (updates `/enquire/` + `/enquiry-received/` together) |
| DATA-TEST | `src/data/testimonials.js:20–23` | empty array | 🟣 Add **real, approved** client quotes, then remove `hidden` on the homepage section (HOME-08). Never fabricate. |
| DATA-MEDIA | `src/data/media.js:44, 60` | `alt` text for hero clips | Confirm alt descriptions once real video lands |

---

## Sign-off checklist

> Round-1 (#155): the reviewed sections below have the artist's approved words applied **and
> their `ARTIST-COPY` markers flipped + stripped**; the open sub-items are noted inline.

- [x] SHARED-01 brand line + SHARED-03 CTA — tagline now "Fine line, high detail and realism…"; markers stripped
- [~] Homepage (HOME-01..07, 09 stripped); HOME-08 testimonials + HOME-10 video credit still off
- [~] About (ABOUT-01..03, 05, 06 stripped); ABOUT-04 stats switched off (8 yrs confirmed, rest TBC)
- [x] Services (SERV-01..06) + real prices/deposits; markers stripped
- [x] FAQ (FAQ-01..05) — now 17 Q&As (added "what to avoid after a tattoo" + "are you registered and insured?"); markers stripped
- [x] Aftercare (AFTER-01..06) + voice consistency settled; markers stripped
- [~] Enquire (ENQ-01..05 stripped); ENQ-06 booking lead time **confirmed**; ENQ-07 consent wording still open
- [~] Visit (VISIT-01..03, 05 voice still open); VISIT-04 hours + getting-here **confirmed**
- [ ] Flash (FLASH-03/04/05 copy applied) — **real drop data/photos still open**
- [~] Portfolio (PORT-01..04 + the 3 style categories); **piece names (PORT-D1) still to confirm**
- [ ] Newsletter (NL-01..04, NLBAND-01)
- [ ] Enquiry received (CONFIRM-01 voice) + 404 (E404-01) + piece pages (PIECE-01)
- [~] Privacy + Terms — trading name **"Beansprout Tattoo"** + **public liability insurance** confirmed; still need **legal review** + ICO/tattoo-reg numbers (dates approved)
- [ ] Reply time (BUS-01) + testimonials (DATA-TEST)
- [ ] `grep -rn "pending approval" apps/web/` returns nothing (now **33** — reviewed-section markers flipped + stripped; the rest are the still-open sections)

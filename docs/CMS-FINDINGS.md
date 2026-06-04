# Content dashboard — findings

**Status:** findings — **tool now decided: Sanity** (2026-06-04). See §5.
**Companion:** [CMS-REQUIREMENTS.md](./CMS-REQUIREMENTS.md) — what Roxy needs to manage (this doc covers *which tool*).

> **DECISION (2026-06-04): Sanity.** Chosen over Sveltia for the easiest login for a non-technical single editor (email/Google, no GitHub account) and the best editing UX. Trade-off accepted: a hosted SaaS dependency on a free tier rather than the zero-cost, repo-resident Sveltia. Editors = Roxy only; free tier is ample at ~200 viewers / one editor.
**Goal:** give Roxy a dashboard she can access easily to manage site content (portfolio, flash, copy, prices) without touching code, at the lowest sensible cost and risk for launch (~200 viewers).

---

## 1. Context — what we're fitting the dashboard to

Beansprout is a **static site** (`apps/web`, Vite-built plain HTML/CSS/JS) deployed to **GitHub Pages**, plus **serverless functions** (`apps/functions`, enquiry/flash/newsletter) deployed to **Netlify**. See [CLAUDE.md](../CLAUDE.md).

Two facts make a dashboard easy to add:

1. **Content is already structured data.** The portfolio and flash grids are generated *at build time* from `apps/web/src/data/pieces.js` and `apps/web/src/data/flash.js` — single sources of truth with documented fields. A dashboard is essentially a friendly UI over these files.
2. **We already run serverless functions** (Netlify), which gives us the one thing a static site otherwise lacks: a secure place to handle dashboard login.

**Implication for hosting:** the dashboard reinforces staying on the static + serverless stack (GitHub Pages / Netlify), with GoDaddy as the **domain registrar only**. Moving to GoDaddy hosting would mean abandoning the build pipeline a dashboard depends on (realistically forcing a WordPress rebuild). Not recommended. See the hosting discussion that preceded this doc.

---

## 2. Requirements (for the design phase to confirm)

- **Editor:** Roxy — non-technical. *Ease of access and editing is the priority.*
- **What she edits:** portfolio pieces (image + tokens: `styles`, `placement`, `status`, `tone`, `glyph`), flash items, body copy (the `<!-- COPY: -->` placeholders), and pricing.
- **Scale:** ~200 viewers; a single editor.
- **Cost stance:** low cost preferred; generous free tiers fine; small spend acceptable *if* it removes launch risk.
- **Acceptable latency:** edits going live in ~1–2 min (a rebuild) is fine; instant is not required.

---

## 3. Options evaluated

Two shapes. The trade-off is **no-subscription / lives-in-your-repo** vs. **easiest editor for a non-technical user**.

### Shape A — Git-based CMS (free, open-source, no subscription)
The dashboard commits content to the repo; the existing GitHub Actions pipeline rebuilds + redeploys. Content stays in your repo — nothing phones home to a vendor.

| Tool | Licence | Cost | Editor access for Roxy |
|---|---|---|---|
| **Sveltia CMS** | MIT, open-source | £0, no subscription | `beansprout.ink/admin`, **login via GitHub**. Modern, well-maintained (Decap successor). |
| **Pages CMS** | MIT, open-source | £0, no subscription | Free hosted sign-in (app.pagescms.org) or self-host; **GitHub login**. |
| **Decap CMS** | MIT, open-source | £0, no subscription | Older option; Sveltia is a drop-in, better-maintained replacement. |

- ✅ No recurring cost, ever, at any traffic. No vendor that can start charging.
- ✅ Fits the build pipeline directly.
- ⚠️ **Login needs a GitHub account** — a friction point for a non-technical artist (she'd need an account and to be added as a repo collaborator). Auth needs a small GitHub OAuth handler, which our existing Netlify functions can host at £0.
- ⚠️ One-time work: move content from JS modules (`pieces.js`) into a CMS-friendly format (JSON/Markdown) that both the build and the dashboard read.

### Shape B — Hosted (headless) CMS (free tier, then subscription)
Content lives in a hosted service; the site fetches it at build and rebuilds via webhook.

| Tool | Free tier | Subscription kicks in when… | Editor access for Roxy |
|---|---|---|---|
| **Sanity** *(best editor UX)* | Generous (ample for one artist) | Multiple editors / high API use (~$15+/editor/mo) | Polished Studio, **email/Google login (no GitHub needed)**, drag-drop media library. |
| **Contentful** | Small-project free tier | Tighter limits, then pricey tier | Email login, good editor. |
| **Storyblok** | Free tier | More editors/features | Visual editor. |
| **Strapi** | Self-hosted = free, **but needs a server (VPS ~£5+/mo)** | Strapi Cloud (hosted) is paid | Email login, full admin. |

- ✅ Best editing experience and the **easiest login for Roxy** (no GitHub account; email/Google).
- ✅ Built-in media library — easiest image uploads.
- ⚠️ A SaaS account: free at our scale today, but the free tier could change, or a per-editor limit could appear later.
- ⚠️ Adds a third vendor to the stack.

---

## 4. Cost summary at ~200 viewers

Everything listed sits at **£0/month** at this scale today. The real distinction is *risk of future cost*:

- **Group A (git-based):** structurally free — no vendor billing relationship at all.
- **Group B (hosted):** free *tier* — depends on a vendor's pricing staying as-is.

GoDaddy hosting, by contrast, would *cost* money and require rebuilding the site — the opposite of the goal.

---

## 5. Recommendation (to validate in the design phase)

Two viable finalists, depending on which we weight harder:

- **If "no subscription / no surprise costs" wins → Sveltia CMS.** Free forever, content in our repo, fits the pipeline. Cost: Roxy needs a GitHub account, and a one-time content-format migration.
- **If "easiest for Roxy" wins → Sanity.** Best editor, email/Google login, drag-drop media — genuinely the lowest-friction for a non-technical artist. Cost: a SaaS dependency on a free tier.

**Leaning:** start with **Sveltia** (zero cost/zero vendor risk for launch) unless the GitHub-account friction proves to be a real barrier for Roxy — in which case **Sanity** is the clean upgrade. This is the key decision to settle when we design it out.

---

## 6. Open questions for the full design

1. **Roxy's login tolerance** — is a GitHub account acceptable, or does she need email/Google? (This single answer largely picks A vs. B.)
2. **Scope of editable content** — portfolio + flash only, or also copy blocks and pricing? Richer page-layout editing pushes toward Sanity.
3. **Image handling** — uploads via the CMS into the repo (git-based) vs. a hosted media library (Sanity). Where do originals live; how are the responsive `avif/webp/jpg` derivatives generated?
4. **Content-format migration** — moving `pieces.js`/`flash.js` to JSON/Markdown that both the build renderers and the CMS consume. Scope this as a discrete task.
5. **Will there ever be more than one editor?** If yes, hosted CMS per-editor costs become relevant.
6. **Preview** — does Roxy need to preview a piece before it goes live, or is the ~1–2 min rebuild-then-check acceptable?

---

## 7. Next concrete step (when we pick this up)

Stand up a proof-of-concept (Sveltia or Sanity) wired to the existing `pieces.js` / `flash.js` schema, so Roxy can try adding a real portfolio piece end-to-end before we commit to either.

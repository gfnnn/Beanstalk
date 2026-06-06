# Deposits & flash purchase — backlog stub (PayPal + Monzo)

Taking **deposits** (custom enquiries) and **flash deposits** online via **PayPal +
Monzo**. **Post-launch backlog — not built, not blocking the apex cutover.** This is a
deliberately short stub: the decisions below are the durable part; the detailed
phase-by-phase build plan was trimmed to avoid it going stale before it's picked up
(see git history for the earlier long-form spec). Flesh it back out when the work
actually starts.

> The studio confirmed **PayPal + Monzo**, reconciled by hand. Related: the deposit
> is the confirmation trigger for [`SCHEDULING.md`](./SCHEDULING.md) — the two
> co-ship as one track. The **fee maths** behind this decision (and the Stripe/Klarna
> alternatives) lives in [`PAYMENTS-FEES.md`](./PAYMENTS-FEES.md).

## The decision that shapes everything: manual reconciliation

Confirmed product decisions (2026-06):

- **PayPal.Me + Monzo.me payment links**, reconciled **by hand** — Monzo has no
  merchant API, and the studio chose manual confirmation for both.
- **Deposit only** taken online (flat £ or % of price — to be pinned, config-driven).
- **Custom-enquiry deposit** is emailed **after** the artist quotes (not inline); the
  **flash** deposit is shown/emailed at claim time.

**Consequence — there is no payment-gateway integration to build.** No PayPal/Checkout
API, no webhooks, no SDK, no card data on the site, no new payment secrets. The links
are just pre-filled URLs (`paypal.me/<handle>/<amount>GBP`,
`monzo.me/<handle>?amount=…&description=<reference>`). What's actually being built is the
bookkeeping around them: a deposit amount, a unique **reference**, on-screen + emailed
instructions, and an artist "mark paid" action.

### Parked for later: Klarna

**Klarna** stays on the table as a **future consideration** — pay-in-3 / "spread the
cost" appeals for larger custom pieces. It is **not** part of the launch model and
changes nothing above, because unlike the manual links it's a **real payment gateway**:
merchant onboarding, an API/SDK to integrate, per-transaction fees, and its own
compliance surface. So it's a separate, heavier track, not a drop-in alongside
PayPal.Me/Monzo.me. Revisit only if customers actually ask to spread payments; until
then it's a note, not a task.

## What this needs from today's code (the real gaps)

1. **A `pending` → `claimed` transition.** `reserveFlashPiece()` only sets `pending`;
   nothing promotes a claim to `claimed`. Manual reconciliation needs an artist-facing
   way to set it (a token-protected admin action — shares the surface with the
   ROADMAP "artist-facing view").
2. **A customer email.** A flash claim only emails the artist today; the payment
   instructions must also reach the customer (a new Resend send).
3. **Stale-pending release.** An unpaid `pending` claim locks a one-of-a-kind piece
   forever — needs a TTL/auto-release (cron, or lazy release on the `flash-status` read).

## Actionable now (independent of the build)

The enquire/FAQ/services copy promises deposits that don't exist yet. The enquire
consent box **no longer names a provider** (done) — keep the rest provider-neutral
until payments ship: `apps/web/faq/index.html` deposit FAQs,
`apps/web/services/index.html` deposit figures.

## To pin before building

Deposit rule (flat vs %), the PayPal.Me/Monzo.me handles, a reference format
(e.g. `BSF-<piece-id>-<4-char>`), the stale-pending window (~48h), and the
reconciliation mechanism (a token-protected `/studio` admin page is the recommendation;
a `wrangler d1 execute` one-liner is the zero-UI fallback). Compliance: deposit fields
are personal/financial data — extend `DATA-COMPLIANCE.md` retention/erasure to cover
them, and a **paid** deposit follows the long-retention rule, not the 12-month prune.

**Out of scope by design:** webhooks / automatic confirmation, storing card data, refund
automation. Ships to staging only — no `apps/web/public/CNAME` (deploy guardrail in
`CLAUDE.md`).

# Payment cost comparison — fees per provider (research notes)

Companion to [`PAYMENTS-PLAN.md`](./PAYMENTS-PLAN.md): the **cost** side of choosing how
to take deposits / flash payments. `PAYMENTS-PLAN.md` holds the *product decision* (manual
PayPal.Me + Monzo.me links, hand-reconciled, no gateway to build); this file holds the
**fee maths** behind that decision and the Stripe/Klarna alternatives, so the trade-off is
on the record.

> **Rates verified June 2026 from the sources at the foot of this file. They change** —
> re-check the provider's own pricing page before relying on a figure. Nothing here is a
> code change; it's a notes/spec addition.

## The one finding that reframes the question

**"Monzo vs Stripe" is largely a false choice for card payments.** Monzo Business's
payment-link card acceptance ("Get Paid") is **processed by Stripe under the hood** — Monzo
is a front-end on the same rails. So the real cost axes aren't *brands*, they're:

1. **Bank transfer (free) vs card (a Stripe-rate %)** — independent of whose logo is on it.
2. **Manual reconciliation (£0 software, costs your time) vs automated webhooks (a % skim,
   buys you automation).**

For small, low-volume deposits the cheapest real-world path is a **Monzo Business "Get Paid"
easy bank transfer**: £0 per-transaction fee, and it pre-fills the payment reference for the
customer — which is exactly the manual flow `PAYMENTS-PLAN.md` wants, minus the personal-
account ToS problem (see the Monzo note below).

## Per-transaction fees (UK, 2026)

| Provider / method | Per-transaction fee | Monthly | Notes |
|---|---|---|---|
| **Monzo Business — easy bank transfer** | **£0.00** | Lite £0 / Pro £9 / Team £25+ | Faster Payments; fee-free to send & receive, indefinitely. Pre-fills the reference. |
| **Monzo.me** (personal P2P link) | **£0.00** for bank-transfer/balance pay | £0 | Free, **but personal accounts aren't for business use** — see note. |
| **Monzo Business — card (via Stripe)** | **1.4% + 20p** UK · 2.5% + 20p EEA · 2.9% + 20p other | as above | Stripe processes it; Monzo passes the fee through. |
| **Stripe** (direct) | **1.5% + 20p** UK · 2.5% + 20p EEA · 3.25% + 20p intl | £0 (standard) | +2% currency conversion. Chargeback **£20/dispute** (kept even if you win). Refund: original fee not returned. |
| **PayPal** — Goods & Services | **2.9% + 30p** UK · +1.29% EEA buyer · +1.99% non-EEA | £0 | +3–4% conversion spread. Micropayment rate exists for sub-£5. |
| **PayPal** — Friends & Family | £0 | £0 | **Against ToS for business + no buyer protection.** Not a real option. |
| **Klarna** | not publicly published; ~2.95% flat reported, instalments reported ~5–6% | varies | Real gateway: merchant onboarding, API/SDK, compliance. Parked in `PAYMENTS-PLAN.md`. |

## Worked examples (what you actually keep)

Deposits are small, so the **fixed fee dominates** — the same method is proportionally more
expensive on a smaller deposit.

**On a £30 deposit:**

| Method | Fee | You keep | Effective |
|---|---|---|---|
| Monzo Business bank transfer | £0.00 | £30.00 | **0%** |
| Monzo Business card (UK) | £0.62 | £29.38 | ~2.1% |
| Stripe (UK card) | £0.65 | £29.35 | ~2.2% |
| Klarna (~2.95%, illustrative) | ~£0.89 | ~£29.11 | ~3.0% |
| PayPal Goods & Services (UK) | £1.17 | £28.83 | **~3.9%** |

**On a £50 deposit:**

| Method | Fee | You keep | Effective |
|---|---|---|---|
| Monzo Business bank transfer | £0.00 | £50.00 | **0%** |
| Monzo Business card (UK) | £0.90 | £49.10 | ~1.8% |
| Stripe (UK card) | £0.95 | £49.05 | ~1.9% |
| PayPal Goods & Services (UK) | £1.75 | £48.25 | ~3.5% |

## Costs that aren't the headline %

- **Reconciliation labour** — the manual model's true cost. Minutes of admin per booking
  (match reference → mark paid in `/studio`), plus error risk. This is what a gateway's %
  buys back via webhooks (auto-promote `pending → claimed`, send the customer email,
  auto-release stale holds — the three gaps `PAYMENTS-PLAN.md` lists).
- **Chargebacks** — ~£20/dispute on Stripe; P2P bank transfers have no chargeback mechanism
  (no fee, but also no protection either way).
- **Refunds** — Stripe/PayPal don't return the original processing fee.
- **Build & maintenance** — a gateway is engineering time (handler, webhook, secrets, CSP
  widening for `js.stripe.com`), ongoing. The manual links are ~£0 to build, which is the
  whole point of the `PAYMENTS-PLAN.md` decision.
- **PCI scope** — Stripe Checkout/Elements keeps card data off the site (SAQ-A territory);
  manual links touch no card data at all.
- **Monzo monthly** — taking *free bank transfers* only needs **Monzo Business Lite (£0/mo)**;
  Pro (£9/mo) is for accounting integrations/invoicing, not for payment acceptance.

## Note: Monzo.me vs Monzo Business "Get Paid"

`PAYMENTS-PLAN.md` names `monzo.me/<handle>` links. **Monzo.me is a *personal*-account P2P
link**, and Monzo's terms say personal accounts aren't for business use — a studio taking
deposits is a business. The business-correct equivalent is **Monzo Business "Get Paid"**,
which gives the same near-zero-cost path (free easy bank transfers, pre-filled reference)
without the ToS issue, and adds Stripe-backed card links if a customer can't do a transfer.
Worth pinning which one the studio actually uses before this ships.

## Bottom line for this project

- **Low volume + small deposits → manual bank-transfer links win on cost** (£0 fees vs the
  ~2–4% a gateway skims), and the admin time is trivial. This matches the existing decision.
- **PayPal done *properly* (Goods & Services) is the most expensive "manual" option** (~3.9%
  on a £30 deposit) — the cheapness only exists if you (mis)use Friends & Family.
- **Stripe's ~2% only becomes worth paying when volume makes manual reconciliation a chore**
  worth automating away — and even then, Monzo Business already gives you Stripe card rails
  plus free bank transfers without a separate integration to build.

## Sources

- [Stripe — UK pricing](https://stripe.com/gb/pricing) · [Stripe fees UK 2026 guide](https://www.wearefounders.uk/stripe-fees-uk-2026/)
- [PayPal UK — business/merchant fees](https://www.paypal.com/uk/business/paypal-business-fees)
- [Monzo — Get Paid fees](https://monzo.com/help/business-accounts/business-getpaid-fees) · [Monzo — Stripe online card payments](https://monzo.com/help/business-getpaid/business-getpaid-stripe-online-card-payments) · [Monzo Business plans & pricing](https://monzo.com/business-banking/plans-pricing)
- [Klarna — how merchant fees work](https://www.klarna.com/uk/business/merchant-support/how-do-i-pay-klarnas-fees/) · [Merchant Machine — Klarna UK fees](https://merchantmachine.co.uk/bnpl/klarna/)
</content>
</invoke>

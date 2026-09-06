# What this shop would still need to be a real print-on-demand business

Overprint demonstrates the two halves the coursework asks for: an owner-editable catalogue,
and a payment that is only trusted when Stripe's signed webhook confirms it. Everything
below is what sits between that and a shop that could actually take an order, print a
shirt, and put it in the post.

This is a gap list, not a plan. Nothing here has been built, and much of it is a decision
rather than a task. **None of it is legal or tax advice** — the legal items in particular
are a starting list of things to take to someone qualified, not a checklist you can work
through alone.

---

## 1. The order goes nowhere

The shop records a paid order and stops. Nothing is printed, nothing ships, and nobody is
told. This is the largest gap and it is the one everything else depends on.

- **No print-on-demand provider is contacted.** Printful, Printify, Gelato, Prodigi and
  others all expose an API that takes an order and returns a fulfilment record. One has to
  be chosen, an account opened, and an API key stored per environment.
- **Nothing pushes the order.** On a verified `paid` webhook the shop would need to submit
  the order to the provider, store the returned fulfilment id, and handle the submission
  failing — a customer whose money was taken but whose order never reached the printer is
  the worst state this system could be in, and it is currently unreachable only because
  nothing is submitted at all.
- **No idempotency on submission.** Stripe retries webhooks. Submitting twice means
  printing twice, at your cost.
- **No status comes back.** The provider signals *in production → shipped → delivered* by
  its own webhook. Today `fulfilmentStatus` is set by hand, and there is no tracking number
  anywhere in the schema.
- **No cancellation window.** Providers allow an order to be edited or cancelled for a
  short period before printing starts. Nothing exposes that.

## 2. There is no print file

This is the gap most likely to be underestimated. **The shop stores a picture of a shirt,
not something a printer can print.**

- `media` holds one display image per product. A provider needs **print-ready artwork**:
  high resolution (typically 300 DPI at the physical print size), transparent background,
  the right colour profile, and correct placement dimensions.
- A design usually needs **several files** — front, back, sleeve, and different sizes for
  different garment sizes, since a 4XL print area is not a S print area.
- Nothing validates artwork on upload. A 72 DPI mockup would be accepted, sent, and printed
  badly.
- The current product images are AI-generated mockups. They are marketing assets. Real
  products need real artwork, which is a separate thing the owner has to supply.

## 3. Products do not map to anything a printer sells

- **Sizes are a catalogue-wide constant** (`['S','M','L','XL']`). A provider sells specific
  garments with their own SKUs, and each size of each colour of each garment is a distinct
  variant id. The shop needs a mapping table from *our product + size* to *their variant*.
- **Colour is not modelled at all.** Every shirt is black because the image happens to show
  a black shirt.
- **Garment choice is not modelled** — brand, fit, weight, unisex versus fitted. These
  change price and print behaviour.
- **Availability is not checked.** Providers discontinue garments and run out of sizes. The
  shop would sell something unprintable and only find out at submission.
- **One item per order.** There is no basket, and quantity is fixed at one. A real shop
  needs a cart, per-line quantities, and a total.

## 4. Money — and the question of who pays whom

**The short answer: Stripe pays you, and you pay the printer. They are two unrelated
transactions.**

For the standard integration with Printful, Printify, Gelato and similar, *you* are the
merchant of record. Stripe settles the customer's payment into your bank account on its
payout schedule. Separately, the provider charges *you* — usually a card or balance on file
— for the garment, the printing and the shipping, at the moment the order is submitted.
Nothing connects the two automatically. The provider is your supplier, not a payee on the
customer's transaction.

Three consequences that are easy to miss:

- **You need working capital.** Stripe's first payout is typically several days out, and
  standard payouts run on a rolling delay after that. The printer charges you immediately.
  You front the cost of every order until the money lands.
- **Your margin is a residual, not a price.** Retail price minus garment cost, minus
  printing, minus shipping, minus Stripe's fee, minus VAT, is what you keep. The current
  prices were chosen to look plausible, not calculated. It is entirely possible to sell at
  a loss without noticing.
- **Stripe's fee is not one number.** It varies by card origin — an EEA consumer card and a
  non-EEA card are charged differently, and currency conversion adds more. Any margin model
  has to assume the worst case, not the best.

The alternative model exists — **Stripe Connect**, splitting a single payment between
parties — but it is designed for marketplaces paying independent sellers, and it is not how
the mainstream POD providers integrate. If a provider does offer it, that changes the
answer, and it is worth asking them directly rather than assuming either way.

Also missing on the money side:

- **No refunds.** There is no refund route, no partial refund, and no way to record one
  against an order. A print-on-demand item usually cannot be restocked, so a refund is a
  straight loss and the policy needs deciding before the first one.
- **No dispute or chargeback handling.** Stripe sends `charge.dispute.created`; nothing
  listens for it.
- **No reconciliation.** Matching Stripe payouts to provider invoices to orders is
  bookkeeping that has to happen monthly and has no support here at all.
- **One currency, hardcoded.** Multi-currency means per-currency prices, not conversion at
  checkout.

## 5. Nobody tells the customer anything

- **No order confirmation email.** The customer sees a confirmation page and never hears
  from the shop again. In practice this is also a legal expectation, not just a courtesy —
  the customer needs a durable record of the contract.
- **No shipping notification and no tracking link.**
- **No transactional email service at all** — Resend, Postmark, SES or similar, plus a
  verified sending domain with SPF, DKIM and DMARC so the mail is not filtered as spam.
- **No refund or cancellation notice.**
- **No customer accounts and no order history.** The confirmation link expires after 30
  minutes by design; after that the customer has no way to see their own order.
- **No support route for an order that goes wrong** beyond a single email address.

## 6. Shipping is not real

- **Germany only**, and free. Both are placeholders.
- **No shipping cost.** Real POD charges per item and per destination, and it changes the
  total the customer must be shown *before* they pay.
- **No delivery estimate**, which is information a buyer is entitled to before ordering.
- **No address validation.** The shop stores whatever Stripe returns; the provider will
  reject a malformed address after payment has been taken.
- **No phone number**, which some carriers require for delivery. It is deliberately not
  collected today — that decision would have to be revisited, with a stated purpose.

## 7. Trading legally

The shop is currently a non-commercial demonstration, and several deliberate decisions
depend on that. Selling for real reverses them.

- **An Impressum becomes mandatory.** §5 DDG applies to commercial services; the current
  omission is justified only by not being one.
- **VAT.** EU distance selling to consumers means charging the customer's local rate once
  you pass the EU-wide €10,000 threshold, and registering for One Stop Shop. Prices must be
  shown inclusive of VAT to consumers. Stripe Tax can calculate it; someone still has to
  file it.
- **Invoices** with seller identity, VAT number and sequential numbering, retained for the
  statutory period — which is far longer than the two years this shop's retention policy
  currently states.
- **Right of withdrawal.** EU consumers normally have 14 days. Custom or personalised goods
  are exempt — but printing an existing catalogue design to order may well *not* count as
  personalised, and getting that wrong is a real liability. This needs a lawyer's answer,
  not a guess.
- **Real terms and conditions.** The present legal page is a demonstration notice.
- **Product compliance.** Textile fibre labelling under Regulation (EU) 1007/2011, and the
  General Product Safety Regulation, which requires an identifiable responsible person in
  the EU. The printer may cover parts of this; that has to be confirmed, not assumed.
- **Packaging registration.** In Germany, VerpackG requires LUCID registration for anyone
  putting packaging into circulation. Whether dropshipping shifts it to the printer is a
  question to ask.

### The one that would stop a real shop today

**The catalogue is built on band names, and the banner reproduces band-style marks.** Two
independent audits flagged this without being asked to. For a demonstration it is a
pastiche; for a shop selling shirts it is trademark infringement and, where a real band is
recognisable, a personality-rights problem too. Print-on-demand providers actively screen
for this and will refuse or take down infringing artwork — so this is not a distant legal
risk, it is a thing that would block fulfilment on day one. Real designs would have to be
originals, or licensed.

## 8. Running it

- **No monitoring or alerting.** If `STRIPE_WEBHOOK_SECRET` is rotated or an endpoint
  breaks, orders sit at `pending` forever and nothing says so. For a shop taking money that
  is the single most valuable alarm to have.
- **No rate limiting on `/shop/checkout`** — a known, recorded gap with a platform-level
  fix.
- **No backup or restore procedure** for the production database, and no rehearsal of one.
- **Retention enforcement is manual**, and the tooling that performs it is scoped to the
  development database.
- **No fraud controls** beyond Stripe's defaults.
- **No analytics** — and adding any would bring consent banners and a privacy-notice update
  with it.

## 9. Things worth deciding before building any of it

Not tasks. Questions whose answers change what gets built.

- **Which provider**, and therefore which product catalogue, which API, and which countries
  can be served at what cost.
- **Who is the merchant of record.** It has been assumed to be you throughout. A provider
  offering to be the seller changes the VAT, invoicing and withdrawal answers entirely.
- **What happens when a print is wrong.** Reprint at your cost, refund, or claim against
  the provider — and how the customer is asked to evidence it.
- **What a "sold out" product means** when nothing is stocked. Today it is a manual switch;
  with a provider it might mean a discontinued garment, which is a different thing.
- **Whether an order can be cancelled after payment**, and for how long, given the printing
  window is measured in hours.
- **Whether to keep collecting an email at all** if no email is ever sent. Right now the
  shop stores one and never uses it, which is exactly the data-minimisation problem its own
  privacy audit raised.

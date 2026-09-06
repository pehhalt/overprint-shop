# Go-live plan: taking real payments

This is a plan, not a log. **Nothing in this document has been executed.**
Overprint stays in Stripe sandbox (`sk_test_` / `pk_test_`) for this sprint, per
`CLAUDE.md`'s production rules — no live keys, no account activation, no Stripe
dashboard settings have been touched to write this. It exists so that switching
the shop to real money later is a checklist, not a rediscovery.

## 1. Activate the Stripe account

Stripe issues live keys only after the account is activated: business details
(legal entity, address), a bank account for payouts, and identity verification
for whoever controls the account. This is a Stripe compliance step, not a code
change, and it can take anywhere from minutes to several days depending on how
much Stripe wants to verify. **Live keys (`sk_live_…`, `pk_live_…`) do not exist
until activation completes** — there is nothing to "swap in" before then, so
this has to start well ahead of any announced launch date.

## 2. Swap the keys — Production only

Once live keys exist, they go into Vercel's **Production environment only**:

- `STRIPE_SECRET_KEY`: `sk_test_…` → `sk_live_…`
- `STRIPE_PUBLISHABLE_KEY`: `pk_test_…` → `pk_live_…` (still unused by the code —
  see the README's [Known limitations](../README.md#known-limitations) — but
  kept consistent with the secret key's mode)

**Preview keeps its `sk_test_` / `pk_test_` values permanently.** The sandbox
preview is what makes the shop usable for ongoing development and demos without
risking real money — every checkout run against `overprint-staging.vercel.app`
should stay a test-mode charge, forever, even after Production goes live.

## 3. Register a live webhook endpoint

Stripe's test mode and live mode each have their **own, separate list of
webhook endpoints** — registering `.../shop/stripe-webhook` in test mode does
nothing for live mode. A live endpoint has to be registered in the Stripe
dashboard (or via the API) pointed at the production URL
(`https://overprint-shop.vercel.app/shop/stripe-webhook`), and Stripe will issue
a **brand-new signing secret** for it — it is not the same secret the sandbox
endpoint uses.

That new secret must replace `STRIPE_WEBHOOK_SECRET` in Vercel's Production
environment.

**This is the single most common way a launch like this fails.** If this step
is missed or the secret isn't updated, live payments still go through at
Stripe's end — the customer is charged — but every webhook delivery fails
signature verification, the handler returns `400` and writes nothing, and no
order is ever marked paid. The failure is silent from the storefront's side: a
customer sees a successful Stripe checkout and a "confirming payment" state
that never resolves, while the shop owner sees no paid order at all. Confirming
this secret is correct is not optional — it is verified directly in step 6
below, before announcing anything.

## 4. Products and prices — no recreation needed

Some Stripe integrations are built around pre-created Stripe **Products** and
**Prices**, synced between test and live mode — for those, going live means
recreating every product and price object in live mode, then updating every
reference to the new live IDs. This is a common and easy step to forget.

**Overprint has no such step.** `POST /shop/checkout` builds each Checkout
Session from **inline `price_data`**, read fresh from the Payload `products`
collection on every request:

```ts
price_data: {
  currency: CURRENCY,
  unit_amount: product.price,       // read from Payload, not from Stripe
  product_data: { name: product.name },
},
```

There are no Stripe Product or Price IDs anywhere in this codebase to
recreate, resync, or repoint. The catalogue lives entirely in Payload; Stripe
only ever sees a price at the moment a customer checks out. Going live changes
which Stripe account is billed, not which Stripe objects exist.

## 5. Managed Payments — revisit before launch

The checkout call explicitly disables Stripe's Managed Payments:

```ts
// This sandbox account has Managed Payments enabled by default, which
// requires every line item's product to carry a Stripe tax code.
managed_payments: { enabled: false },
```

Managed Payments is on by default for new Stripe accounts and, when enabled,
rejects a Checkout Session built from inline `price_data` unless the product
carries a Stripe tax code — this app's `price_data` never sets one, so leaving
Managed Payments on 502s every checkout attempt.

Turning it off is the right call for a sandbox project with no real tax
obligations. It is **not** necessarily the right call for a real shop selling
to real customers, where Managed Payments' automatic tax handling may be
exactly what's wanted. **This decision should be revisited, not carried over
unexamined, before taking live payments** — the real choice is between (a)
keeping `managed_payments: { enabled: false }` and handling tax obligations
some other way, or (b) turning Managed Payments on and adding a proper Stripe
tax code to each product's `price_data`. Either is workable; silently keeping
the sandbox's default is not a decision, just an oversight.

## 6. Verify before announcing

Before telling anyone the shop is live:

1. Make **one real purchase**, for the smallest amount the catalogue allows,
   using a real card.
2. Confirm in the Stripe dashboard (live mode) that the webhook delivery to
   `/shop/stripe-webhook` shows a **200** response.
3. Confirm in the production admin panel that the corresponding order shows
   **paid**, not pending.
4. **Refund the purchase** from the Stripe dashboard.

Only after all four of those check out — not just the charge succeeding at
Stripe's end, but the webhook delivering and the order actually flipping to
paid — is it safe to treat live payments as working.

## 7. What does not change

Going live is a keys-and-endpoint change, not a re-architecture:

- **The deployment pipeline** — `feat/*` → PR → `main` (sandbox preview) →
  merge into `production` (live) — is unchanged. See the README's
  [deployment pipeline](../README.md#deployment-pipeline).
- **Both Supabase projects** stay as they are: the dev project for local work
  and the sandbox preview, a separate production project for real orders. Going
  live does not introduce a third database or touch either existing one.
- **The Blob stores** — the dev/preview Blob store and the production Blob
  store — are unaffected; product images already live in the production store
  regardless of which Stripe mode is active.
- **The application code** does not change at all. The checkout and webhook
  handlers already read `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from
  the environment; going live is entirely a matter of which values Vercel's
  Production environment holds for those two variables, plus the Managed
  Payments decision in step 5 if that gets revisited.

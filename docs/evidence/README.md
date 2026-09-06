# Evidence

Screenshots and verifiable output backing the project's claims. Everything here was captured
against deployed environments, not localhost.

Live shop: https://overprint-shop.vercel.app · Sandbox preview: https://overprint-staging.vercel.app

---

## The owner edits content and it goes live with no redeploy

| File | Shows |
|---|---|
| [`09-admin-product-edit.png`](./09-admin-product-edit.png) | `SoulKabine`'s price changed to `2400` in the **production** admin panel and saved — "Updated successfully", last modified 02:20 local time |

The other half of that proof is timing, which is stronger than a second screenshot:

```
Last production deployment:  2026-09-06T00:01:40Z
Product edited in the panel: 2026-09-06T00:20Z   (02:20 local)
Live site immediately after: SoulKabine €24.00
Deployments in between:      none
```

The edit landed nineteen minutes after the last deploy and appeared on the live site with no
workflow run of any kind. Note also the field's own help text — *"Price in cents, as an
integer. 2500 means EUR 25.00"* — which is how the integer-cents constraint is surfaced to a
non-technical owner.

---

## Payment confirmed only by a verified webhook

| File | Shows |
|---|---|
| [`01-checkout-success-production.png`](./01-checkout-success-production.png) | The confirmation page on the **live shop** after paying with `4242 4242 4242 4242` |
| [`02-card-declined-production.png`](./02-card-declined-production.png) | Stripe's hosted checkout on the **live shop** refusing `4000 0000 0000 0002`. The message is German: *"Ihre Kreditkarte wurde abgelehnt"* — "your credit card was declined". Note the **Sandbox** badge |
| [`03-webhook-delivery-200.png`](./03-webhook-delivery-200.png) | Stripe's delivery log for the **Overprint production** endpoint: `checkout.session.completed`, **200 OK**, Delivered |
| [`08-admin-orders.png`](./08-admin-orders.png) | The Orders collection in the production admin panel — one `Paid` with a timestamp, two `Pending` |
| [`04-checkout-success-preview.png`](./04-checkout-success-preview.png) | The same success flow on the sandbox preview |
| [`05-card-declined-preview.png`](./05-card-declined-preview.png) | The same decline on the sandbox preview |

**Exactly one delivery appears in Stripe's log**, matching the one successful purchase. The
declined card produced no Stripe event at all.

Production database state:

```
#2  PAID     2300 cents   Rambling Men - T-Shirt   paid via verified webhook
    paidAt = 2026-09-06 00:55:13   intent = pi_3UCSUNGqFQLExwlb1LJjzV7o
#3  PENDING  2300 cents   The Chilis - T-Shirt     card declined
#4  PENDING  2300 cents   SoulKabine               checkout abandoned
```

Three orders, and the third is worth reading carefully. **A declined card and an abandoned
checkout are indistinguishable in this data** — both are simply "not paid", with no
`paidAt` and no payment intent. That is the correct outcome for both, and it is what the
design buys: an order only ever becomes `paid` on a verified webhook, so every other
route through the system leaves it `pending`, whatever the reason.

Orders are created `pending` when checkout starts. Nothing else in the system can mark one
paid — `create`, `update` and `delete` are closed to every HTTP path, and the webhook writes
through Payload's Local API.

---

## Sold-out state

| File | Shows |
|---|---|
| [`10-sold-out-live.png`](./10-sold-out-live.png) | "The Spix" showing as sold out on the live shop, with no buy button |

Checked at the API level too: `POST /shop/checkout` for that product returns **HTTP 409**,
creating no Stripe session and no order row. The guard is server-side, not just a hidden
button.

---

## The rollback rehearsal

| File | Shows |
|---|---|
| [`06-rollback-site-broken.png`](./06-rollback-site-broken.png) | The **live site** serving a deliberately broken heading after the break was promoted |
| [`07-rollback-site-restored.png`](./07-rollback-site-restored.png) | The live site healthy again after Vercel's instant rollback — no rebuild |
| [`11-vercel-rollback.png`](./11-vercel-rollback.png) | Vercel's Deployments list, filtered to **Production**: PR #11's deployment marked failed, PR #7's re-promoted by the rollback, PR #13 now current |

Full write-up, including the two things that went wrong: [`../rollback-rehearsal.md`](../rollback-rehearsal.md).

That deployments list is also the evidence for a finding in the write-up: with the filter
**off**, three preview deployments sat between the broken build and the last live one, and
`Instant Rollback` was greyed out on all of them. Filtering to Production is what makes the
valid target obvious.

---

## The pipeline is the only thing that deploys

`vercel.json`, committed to the repository rather than set in a dashboard:

```json
{
  "framework": "nextjs",
  "git": { "deploymentEnabled": false },
  "regions": ["dub1"]
}
```

`git.deploymentEnabled: false` switches off Vercel's own git deploys on every branch.
Vercel's Git integration was additionally never connected to this repository, so no
deployment has ever originated outside the pipeline.

Workflow runs to date:

```
14  CI                      success
 9  Deploy sandbox preview  success
 4  Deploy production       success
 1  Deploy sandbox preview  failure     (an empty VERCEL_TOKEN secret)
 1  Deploy sandbox preview  cancelled   (payload migrate hung; pool too small)
```

Both failures are left in the history deliberately. They were real, they are documented, and
a pipeline with no failures in it would be the less honest artefact.

---

## Branch-and-pull-request history

13 merged pull requests — 11 into `main`, 2 into `production`:

```
 #1  -> main        Add CI and deployment workflows
 #2  -> main        Tell Vercel this is a Next app, and manage dev schema by migration
 #3  -> main        Give build-time migrations room; max:1 deadlocks payload migrate
 #4  -> main        Pool size for Payload
 #5  -> main        Document migrate-only schema workflow; fix dead config and pool comment
 #6  -> main        Take payments through Stripe Checkout, confirmed by a verified webhook
 #7  -> main        Disable Managed Payments to fix checkout 502
 #8  -> main        Write the production rules down, and bind the agent to them
 #9  -> main        Add the README and a written go-live plan
#10  -> main        Break the shop name on purpose, to rehearse an instant rollback
#11  -> production  Promote the deliberate break to production (rollback rehearsal)
#12  -> main        Revert the deliberate break — the rollback fixed the deploy, not the repo
#13  -> production  Promote the revert — bring the repository back in line with the live site
```

No commit has ever been made directly to `main` or `production`.

---

## Environments are separated

Both deployments run identical code against different databases. Checked live:

```
https://overprint-shop.vercel.app       /=200  api=200  unsigned-webhook=400  totalDocs=4
https://overprint-staging.vercel.app    /=200  api=200  unsigned-webhook=400  totalDocs=3
```

Production serves the owner's four real products; preview serves three generated development
fixtures. They are different Supabase projects (`wdjtkrplvqbkxsfthmgk` and
`mhkkjrulpeavwawvfvbn`), verified by connecting to each. Each environment has its own Vercel
Blob store — visible in the image URLs, which differ by host — its own `PAYLOAD_SECRET`, and
its own Stripe webhook signing secret.

`unsigned-webhook=400` on both is the security property, live: an unsigned POST to the
webhook endpoint is rejected on each environment.

---

## Access control

The graded rule — "anyone can view products, only a logged-in admin can change them" —
verified against the deployed site rather than only in a test:

```
GET  /api/products   -> 200   anyone may read
POST /api/products   -> 403   an anonymous write is refused
```

The Playwright suite additionally asserts the product count does not increase after the
refused write, since a 403 that still wrote a row would pass a status-only check.

---

## Not captured

- **A screenshot of the live catalogue immediately after the price edit.** The timing
  evidence above covers the same claim: the edit is live and no deployment ran.
- **An upload larger than 4.5 MB.** `clientUploads: true` is set precisely because Vercel
  caps server-side uploads at that size, but the largest photo uploaded through the deployed
  admin panel is 2 MB, so the threshold itself is untested.

# Evidence

Screenshots and verifiable output backing the project's claims. Everything here was captured
against deployed environments, not localhost.

Live shop: https://overprint-shop.vercel.app · Sandbox preview: https://overprint-staging.vercel.app

---

## Payment confirmed only by a verified webhook

| File | Shows |
|---|---|
| [`01-checkout-success-production.png`](./01-checkout-success-production.png) | The confirmation page on the **live shop** after paying with `4242 4242 4242 4242` |
| [`02-card-declined-production.png`](./02-card-declined-production.png) | Stripe's hosted checkout on the **live shop** refusing `4000 0000 0000 0002`. The message is in German: *"Ihre Kreditkarte wurde abgelehnt"* — "your credit card was declined". Note the **Sandbox** badge beside the shop name |
| [`03-webhook-delivery-200.png`](./03-webhook-delivery-200.png) | Stripe's delivery log for the **Overprint production** endpoint (`https://overprint-shop.vercel.app/shop/stripe-webhook`): `checkout.session.completed`, **200 OK**, Delivered |
| [`04-checkout-success-preview.png`](./04-checkout-success-preview.png) | The same success flow on the sandbox preview |
| [`05-card-declined-preview.png`](./05-card-declined-preview.png) | The same decline on the sandbox preview |

**Exactly one delivery appears in the log.** The declined card produced no Stripe event at
all, which is why the order it created is still `pending` — the evidence for the decline is
the absence of a delivery combined with the presence of an unpaid order.

Database state after the two production card runs:

```
#2  PAID     2300 cents   Rambling Men - T-Shirt
    paidAt = 2026-09-06 00:55:13   intent = pi_3UCSUNGqFQLExwlb1LJjzV7o
#3  PENDING  2300 cents   The Chilis - T-Shirt
    paidAt = (null)       intent = (null)
```

An order is created `pending` when checkout starts, and only the signature-verified webhook
flips it to `paid`. A declined card therefore leaves a visible unpaid row rather than
nothing at all.

---

## The rollback rehearsal

| File | Shows |
|---|---|
| [`06-rollback-site-broken.png`](./06-rollback-site-broken.png) | The **live site** serving a deliberately broken heading after the break was promoted to production |
| [`07-rollback-site-restored.png`](./07-rollback-site-restored.png) | The live site healthy again after Vercel's instant rollback — no rebuild, no deploy |

Full write-up, including the two things that went wrong: [`../rollback-rehearsal.md`](../rollback-rehearsal.md).

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

`git.deploymentEnabled: false` switches off Vercel's own git deploys on every branch, so
only the GitHub Actions workflows can ship. Vercel's Git integration was additionally never
connected to this repository, so no deployment has ever originated outside the pipeline.

Workflow runs to date:

```
14  CI                      success
 9  Deploy sandbox preview  success
 4  Deploy production       success
 1  Deploy sandbox preview  failure     (the first attempt; see below)
 1  Deploy sandbox preview  cancelled   (a hang, diagnosed and fixed)
```

The failure and the cancellation are left in the history deliberately. They were real: an
empty `VERCEL_TOKEN` secret, and a `payload migrate` that hung because the connection pool
was too small for it. Both are documented in [`../rollback-rehearsal.md`](../rollback-rehearsal.md)
and the project README's limitations section.

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
`mhkkjrulpeavwawvfvbn`), verified by connecting to each. Each environment also has its own
Vercel Blob store — visible in the image URLs themselves, which differ by host — and its own
`PAYLOAD_SECRET` and Stripe webhook signing secret.

`unsigned-webhook=400` on both is the security property, live: an unsigned POST to the
webhook endpoint is rejected on each environment.

---

## Access control

The graded rule is "anyone can view products, only a logged-in admin can change them",
verified against the deployed site rather than in a test:

```
GET  /api/products   -> 200   anyone may read
POST /api/products   -> 403   an anonymous write is refused
```

The Playwright suite additionally asserts that the product count does not increase after the
refused write — a 403 that still wrote a row would otherwise pass a status-only check.

---

## Not captured here

Honest list of things a reviewer might expect and will not find:

- **A screenshot of a product being edited in the admin panel.** The no-redeploy claim is
  evidenced by timing instead: the four production products were created after the last
  deployment, with no workflow run in between, and appeared live immediately.
- **A screenshot of the Orders list in the admin panel.** The database state above is the
  same evidence in a more precise form.
- **A screenshot of the Vercel deployments list showing the rollback.** The before-and-after
  screenshots of the live site cover the outcome; the deployment list would show the
  mechanism.
- **A sold-out product on the live site.** It exists — "The Spix" is marked sold out and its
  checkout is refused with HTTP 409, confirmed live — but was not captured.

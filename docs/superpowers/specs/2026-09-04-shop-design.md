# Design — print-on-demand t-shirt shop

**Date:** 2026-09-04
**Status:** approved, ready for implementation planning
**Sprint:** BwAI Sprint 4 — Sprint Project ("Ship Your Own Online Shop")

---

## 1. What we are building

A small print-on-demand t-shirt shop. The owner logs into an admin panel and manages a
catalogue of three or four shirt designs — each with a name, a price, a short description
and a mockup photo. A visitor browses the catalogue, picks a shirt, and pays through
Stripe's hosted Checkout running in sandbox. The order is marked paid only when Stripe's
own signed webhook confirms it.

The catalogue is the CMS. The shirt sale is the payment. Both halves the brief requires
are load-bearing: remove the CMS and the owner cannot change the catalogue without a
redeploy; remove Stripe and nothing is sold.

**Print-on-demand is the shop's premise, not an integration.** No fulfilment provider
(Printful, Printify or otherwise) is contacted. This was a deliberate scope decision —
see §12.

This description belongs at the top of `CLAUDE.md`, in plain language, per requirement 1.

## 2. Scope

### In

- Payload CMS admin panel, login-protected, with an owner-editable `products` catalogue
- Product photos uploaded through the admin panel, served from Vercel Blob
- Public catalogue and product pages
- Stripe hosted Checkout in sandbox, test keys only
- Orders written to Payload, marked paid **only** on a signature-verified webhook
- Two Supabase projects: development and production, kept separate
- GitHub Actions pipeline with two deploy paths; Vercel's own auto-deploy disabled
- Optional tasks: Orders collection, confirmation page, sold-out state, rollback
  rehearsal, written go-live plan

### Out

- Any print-on-demand fulfilment provider integration
- Customer accounts, carts holding multiple items, saved addresses
- Shipping calculation, tax handling, discount codes
- Live Stripe mode, account activation, real money
- A custom domain (optional task deliberately skipped — see §12)
- Supabase Auth (see §3)

## 3. Stack

- **Next.js** (App Router) + TypeScript
- **Payload 3**, installed inside the Next app
- **Supabase Postgres** — two projects, development and production
- **Vercel Blob** for uploaded media, via `@payloadcms/storage-vercel-blob`
- **Stripe** Node SDK, sandbox / test keys only
- **Tailwind CSS**
- **Vercel** hosting, **GitHub Actions** deployment
- **Vitest** for unit and integration tests, **Playwright** for end-to-end

Scaffold with `create-payload-app` (blank template, postgres adapter) rather than
`create-next-app` followed by a manual Payload install. Same destination, materially
fewer wiring mistakes.

### Supabase is used only as Postgres

Payload brings its own `users` collection and its own login, and **that is the
login-protected admin panel the brief requires**. Supabase Auth is not used anywhere in
this project. Adding it would mean a second authentication system guarding nothing.
Supabase's role here is: managed Postgres, twice, in two separate projects.

### Prerequisites (requirement 2 — do these before writing any code)

```
npx skills add payloadcms/skills
claude plugin install stripe@claude-plugins-official
```

Both must be installed before implementation begins, so the agent works from current
official guidance rather than from training data.

## 4. Data model

### `users` — Payload auth collection

The shop owner. Created through Payload's first-user flow on each environment. This
collection is what makes the admin panel login-protected.

### `media` — upload collection

Fields: the upload itself, plus `alt` text.

Storage: `@payloadcms/storage-vercel-blob` with **`clientUploads: true`**.

> **`clientUploads: true` is not optional.** Vercel caps server-side uploads at 4.5 MB
> and a shirt mockup photo will exceed that. Discovering this after the catalogue is
> populated means re-uploading every asset.

### `products`

| Field | Type | Notes |
|---|---|---|
| `name` | text | required |
| `slug` | text | required, unique, indexed — used for `/products/[slug]` |
| `price` | number | **integer, minor units (cents)**, required |
| `description` | textarea | short description; plain text, not rich text |
| `photo` | upload → `media` | required |
| `soldOut` | checkbox | default `false` |

**Price is an integer number of cents.** Never a float. Floating-point money is a bug
with a delay fuse, and Stripe expects minor units regardless.

**Currency is a single application-wide constant, not a field.** One currency, no
per-product currency selection.

**Access control — this is evaluation criterion 1, so it is written deliberately:**

- `read`: open to everyone, authenticated or not
- `create`, `update`, `delete`: require a logged-in user

### `orders`

Written by the server only.

- `read`: admins only
- `create`, `update`, `delete`: **closed to the API entirely.** The sole writer is the
  webhook handler, through Payload's Local API with access overridden server-side.

| Field | Type | Notes |
|---|---|---|
| `stripeCheckoutSessionId` | text | unique, indexed — **the idempotency key** |
| `stripePaymentIntentId` | text | set when payment succeeds |
| `email` | email | from the Checkout Session |
| `status` | select | `pending` / `paid` / `expired` |
| `amountTotal` | number | minor units, snapshot |
| `paidAt` | date | set only by the webhook |
| `items` | array | see below |

Each `items` entry holds: a relationship to the product, **plus a snapshot of the
product name and unit price at purchase time**, plus quantity.

> **Why snapshot.** The owner can edit a price in the CMS five minutes after a sale. An
> order must record what was actually charged, not what the catalogue says today. A bare
> relationship would silently rewrite history every time a price changed.

**Order lifecycle: `pending` on Checkout Session creation, flipped to `paid` only by the
verified webhook.** See §12 for why this beats creating the row on the webhook alone.

### `faqs` — second collection (optional task)

Fields: `question`, `answer`, `order`. Rendered on a public `/faq` page. Exists to prove
a non-technical owner can edit site content, not just products, with no redeploy.

## 5. Money flow

1. Buyer clicks Buy on a product page → `POST /api/checkout` with the product id.
2. The server loads the product **from Payload by id and reads the price from the
   database.**

   > **The server never accepts a price, name or amount from the client.** A
   > client-supplied price is a free-shirt button. This is the single most important
   > security property in the application.

3. If the product is `soldOut`, refuse with an error; create no session and no order.
4. Create a Stripe Checkout Session, `mode: 'payment'`, using **inline `price_data`**
   built from the Payload record — not pre-created Stripe Products.
   - `success_url`: `/order/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: back to the product page
5. Write the `orders` row with `status: 'pending'` and the Checkout Session id.
6. Return `session.url`; the browser redirects to Stripe.
7. Stripe calls `POST /api/stripe/webhook`:
   - `export const runtime = 'nodejs'` (the Stripe SDK needs Node crypto)
   - Read the **raw body** with `await req.text()`
   - Verify with `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
   - **Bad or missing signature → 400, and nothing is written.**
   - On `checkout.session.completed` **and** `session.payment_status === 'paid'`: find
     the order by session id, set `status: 'paid'`, `paidAt`, `stripePaymentIntentId`
   - On `checkout.session.expired`: set `status: 'expired'`
   - Already-paid order, replayed event, or any other event type → 200, change nothing
     (**idempotent**)
8. `/order/success?session_id=…` reads **our own database** by session id and displays
   the order.

   > **The success page marks nothing paid.** It has no authority. If the webhook has not
   > landed yet — webhooks lag by a second or two — it honestly shows a "confirming
   > payment" state rather than claiming success. Separating these two jobs is the point
   > of requirement 6.

### A note on the publishable key

Redirecting to `session.url` requires **no Stripe publishable key at all**; the key is
only needed for the client-side `stripe.js` redirect, which this design does not use.
The brief names `pk_test_`, so it is set in the environment and this omission is
documented in the README, rather than left for a reviewer to wonder about.

## 6. Environments and secrets

| Variable | Local | Vercel Preview | Vercel Production | GitHub Actions secret |
|---|---|---|---|---|
| `DATABASE_URI` | dev Supabase | dev Supabase | **prod Supabase** | — |
| `PAYLOAD_SECRET` | local value | preview value | prod value (all three different) | — |
| `BLOB_READ_WRITE_TOKEN` | dev store | dev store | prod store | — |
| `STRIPE_SECRET_KEY` | `sk_test_…` | `sk_test_…` | `sk_test_…` | — |
| `STRIPE_WEBHOOK_SECRET` | from `stripe listen` | preview endpoint secret | **prod endpoint secret** | — |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3000` | stable staging alias | production URL | — |
| `VERCEL_TOKEN` | — | — | — | yes |
| `VERCEL_ORG_ID` | — | — | — | yes |
| `VERCEL_PROJECT_ID` | — | — | — | yes |

The three Vercel deployment values live **only** in GitHub's encrypted Actions secrets,
never in the repository. No database credential is ever placed in GitHub secrets — see
§7 on migrations for why that is not needed.

### Two Supabase projects

Evaluation criterion 3 (weight 2) states plainly: *"There are distinct development and
production Supabase projects."* It carries no compromise clause, even though the task
description offers one. Supabase's free tier permits two active projects per
organisation; the feature that genuinely requires a paid plan is per-pull-request
**branching**, which appears only in a hard optional task we are not taking. So the
compromise is being offered for a limit that does not bind here. **Build two projects.**

### Connection string: session pooler

`DATABASE_URI` uses Supabase's **session-mode pooler**. Supavisor's session mode supports
prepared statements; transaction mode does not, and Payload's Drizzle-based Postgres
adapter uses them. Payload's own Supabase guide is silent on this, which is precisely why
it catches people.

If session mode misbehaves under serverless connection pressure, the documented fallback
is transaction mode with prepared statements disabled — recorded here so the decision is
not rediscovered under time pressure.

### One Stripe sandbox, two webhook endpoints

A single sandbox, but a **separate webhook endpoint per environment**, each with its own
signing secret. This is what makes "Stripe keys scoped to the right environments" true
rather than merely claimed.

### The preview-URL trap

Vercel preview deployments receive a fresh URL on every deploy, but a Stripe webhook
endpoint needs a stable one. The `main` deploy therefore **assigns a fixed alias** as a
step in its workflow, and the preview webhook endpoint points at that alias. Without
this, webhooks silently stop arriving every time a pull request merges.

## 7. Deployment pipeline

### Branches

```
feat/*  --PR-->  main  --(deploys sandbox preview)
                  |
                  '--merge-->  production  --(deploys live site)
```

### Vercel auto-deploy is off, declaratively

`vercel.json`:

```json
{ "git": { "deploymentEnabled": false } }
```

This disables Vercel's own automatic deployments on every branch while leaving CLI
deploys working — so the GitHub Actions workflow is the only thing that ships. Keeping it
in `vercel.json` rather than a dashboard toggle means the requirement is visible in the
repository, which is better evidence for criterion 2.

### Workflows

| File | Trigger | Does |
|---|---|---|
| `ci.yml` | pull request | install, typecheck, lint, test, build |
| `deploy-preview.yml` | push to `main` | `vercel pull --environment=preview` → `vercel build` → `vercel deploy --prebuilt` → assign stable alias |
| `deploy-production.yml` | push to `production` | `vercel pull --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod` |

### Migrations

The build script is `payload migrate && next build`. Because `vercel pull` fetches the
correct per-environment `DATABASE_URI` before `vercel build` runs, migrations execute
against the right database automatically and **no database credential needs to enter
GitHub's secrets**.

Payload's schema `push` mode is enabled in development only and disabled elsewhere, so
production schema changes can arrive solely through a reviewed migration.

## 8. Testing

**Test-driven, on the two things that are actually graded:**

- `POST /api/checkout` — price is read from the database and not from the request; a
  sold-out product is refused; no order row is written when checkout is refused.
- `POST /api/stripe/webhook` — an invalid signature returns 400 and writes nothing; a
  valid `checkout.session.completed` with `payment_status: 'paid'` flips the order to
  paid; a replayed event is a no-op; an unrelated event type is a no-op.

Webhook fixtures are signed with Stripe's `generateTestHeaderString` so signature
verification is exercised for real rather than stubbed away.

**Playwright**, following sprint 3's setup: the public catalogue renders, the admin login
page is reachable, and a sold-out product cannot be purchased.

**Manual, screenshotted, against the deployed site** — the two-card test:

- `4242 4242 4242 4242` → order appears as **paid** in the admin panel
- `4000 0000 0000 0002` → declined; the order remains **pending**; nothing is paid

Both use any future expiry and any three-digit CVC. A full end-to-end Stripe redirect
test is flaky and the brief wants human-visible evidence in any case.

## 9. Optional tasks

At least one is required; a second earns bonus points. Each is done on its own feature
branch and pull request.

| Task | Tier | Committed? |
|---|---|---|
| Orders collection in Payload | Medium | Yes — requirement 6 needs an order record regardless |
| Order confirmation page | Easy | Yes — the success page must exist; listing the purchase is the increment |
| Sold-out state from the admin panel | Easy | Yes — one checkbox, one UI branch, one checkout guard |
| Instant-rollback rehearsal | Medium | Stretch — pure demonstration, strong evidence for criterion 2 |
| Written go-live plan | Hard | Stretch — documentation only, hard-tier credit |
| A second Payload collection (`faqs`) | Easy | Stretch |
| Custom domain | Medium | **No** — real money and DNS propagation waits |
| Scheduled health check | Hard | **Deferred** — depends on the loop-engineering lesson in part 6/7; revisit during the coverage review |

## 10. Three days

### Day 1 — plumbing

Agent skills installed first. Two Supabase projects. Scaffold. `users`, `media`,
`products`. Vercel Blob with `clientUploads`. Public catalogue and product pages. Vercel
project with both environments configured. `vercel.json`. All three workflows. The
`production` branch. Stable staging alias.

**Exit condition:** a live URL, and a product edited in the *production* admin panel
appearing on the live site with no redeploy. Screenshot both.

### Day 2 — money

`orders`. `POST /api/checkout` (test-driven). `POST /api/stripe/webhook` (test-driven).
Local verification with the Stripe CLI, then both cards against the deployed site.
Confirmation page.

**Exit condition:** card `4242…` produces a paid order visible in the production admin
panel; card `4000…0002` leaves the order pending. Both screenshotted, both against the
deployed site rather than localhost.

### Day 3 — the marks that are cheap to lose

Sold-out state and `faqs`, each on its own branch and PR. Rollback rehearsal. Go-live
plan. README, evidence, and a clean read of the repository history. Approximately two
hours of deliberate buffer.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Node 26.3.1 is newer than Payload's supported range; `sharp` may fail to build | Pin to Node 22 LTS via `.nvmrc` and `engines`; verify `sharp` within the first hour |
| Transaction-mode pooler breaks Drizzle prepared statements | Session pooler from the first commit; fallback documented in §6 |
| Vercel Blob 4.5 MB server-upload cap rejects mockup photos | `clientUploads: true` from the first commit |
| Preview URL churn silently breaks the webhook | Stable alias assigned in `deploy-preview.yml` |
| Webhook lag makes the success page look broken | Success page shows a confirming state and asserts nothing itself |
| Payload migrations fail on first production deploy | Day 1 deploys a live site before any real features exist, so this surfaces with two days of slack |

## 12. Decisions taken, and what was rejected

**Print-on-demand as theme, not integration.** A real Printful or Printify integration
would be a second API with its own keys, sandbox and failure modes, and the brief asks
for none of it. Rejected as a threat to the three graded days. Size and colour variants
were also rejected: roughly half a day for a variant model, selection UI and per-variant
stock state, in exchange for nothing the evaluation criteria mention.

**Own repository rather than a subdirectory of `BwAI-sprint4`.** Criterion 4 wants a
repository history that legibly shows feature branches, merged pull requests into `main`,
and a merge into `production`. A dedicated repository makes every pull request a shop
pull request and every deploy a shop deploy. Rejected: a subdirectory with path-filtered
workflows, because merging `main` into `production` would drag parts 1–7 along and dilute
the graded history; and a git submodule, because a reviewer who forgets `--recursive`
sees an empty folder.

**Vercel Blob rather than Supabase Storage.** Supabase Storage is the tidier architecture
— media beside its database, one dev/prod boundary instead of two vendors. Vercel Blob
was chosen because it is one environment variable scoped exactly like `DATABASE_URI`, and
day 1 is already carrying the most risk in the project. Criterion 3 concerns
`DATABASE_URI` and Stripe keys, not media, so nothing is lost on the grade.

**Orders created `pending`, then flipped to `paid`.** Creating the row only on the webhook
is equally correct and was rejected on evidence grounds. With a declined card, Stripe
keeps the customer on its own page and fires no webhook at all — so create-on-webhook
leaves you showing a reviewer an empty table and asking them to take your word for it.
Pending-then-paid leaves a visible row that never became paid, which is the bonus point
made showable. It is also the more realistic production pattern and lets the order record
what was in the basket before payment was attempted.

**Inline `price_data` rather than synced Stripe Products.** Keeps the CMS as the single
source of truth for price, with nothing to keep in sync and no drift between the
catalogue and Stripe. It also shortens the go-live plan, since there are no live-mode
products and prices to recreate.

**Custom domain skipped.** Real money and DNS propagation waits, for one medium-tier
optional task, when cheaper ones are available.

## 13. Open items

- **The shop's name.** Provisionally **Overprint**. This is a placeholder chosen so the
  spec contains no blanks; it is the user's call and costs one commit to change, as long
  as it is settled before it hardens into `CLAUDE.md`, product slugs and the README.

## 14. Where this document lives

Written in `BwAI-sprint4`, where the planning happened. It is copied into the shop's own
repository when that is scaffolded on day 1, so the shop repository is self-contained for
a reviewer reading it alone.

# Overprint

Overprint is a small print-on-demand t-shirt shop. The owner logs into an admin panel and manages a catalogue of three or four shirt designs — each with a name, a price, a short description and a mockup photo. A visitor browses the catalogue, picks a shirt, and pays through Stripe's hosted Checkout running in sandbox. The order is marked paid only when Stripe's own signed webhook confirms it.

The catalogue is the CMS. The shirt sale is the payment. Both halves are load-bearing: remove the CMS and the owner cannot change the catalogue without a redeploy; remove Stripe and nothing is sold.

Print-on-demand is the shop's premise, not an integration — no fulfilment provider is contacted.

## Constraints that must not be violated

- **Prices are integers in minor units (cents).** Never a float, anywhere.
- **One currency**, an application-wide constant (EUR). Not a per-product field.
- **The server never accepts a price, name or amount from the client.** Every amount sent to Stripe is read from the database inside the same request. A client-supplied price is a free-shirt button.
- **An order is marked paid only by the signature-verified Stripe webhook** — never because a browser reached the thank-you page. The success page reads and displays; it has no authority.
- **Our HTTP handlers live outside `/api`.** Payload mounts its REST API at `/api/[...slug]`. Ours are `/shop/checkout` and `/shop/stripe-webhook`.
- **Stripe stays in sandbox.** `sk_test_` / `pk_test_` only. Never live keys, never account activation.
- **`DATABASE_URI` is Supabase's session-mode pooler** (port 5432, host contains `pooler.supabase.com`). Transaction mode (6543) drops prepared statements, which Payload's Drizzle adapter needs.
- **Node 22.** Pinned in `.nvmrc`, `engines`, and Volta.
- **Products access rule:** anyone may read; only a logged-in admin may create, edit or delete.

## Schema changes: migrate, never push

`src/payload.config.ts` sets `push: false`. Payload does **not** sync schema changes automatically, in any environment, including local development. If you add, rename or remove a field on a collection (e.g. `src/collections/Products.ts`), you must generate and run a migration yourself:

```
volta run --node 22 -- npx payload migrate:create <name>
volta run --node 22 -- npx payload migrate
```

**Why push is off:** Payload's dev-only push mode writes a `batch: -1` row into `payload_migrations`. When a real migration later runs against that database, `payload migrate` sees that row and prompts "data loss will occur. Would you like to proceed?" — a prompt with no TTY in CI, so the deploy hangs indefinitely rather than failing or succeeding. Keeping push off in every environment, including local dev, means that row is never written and every environment's schema history stays identical.

**If you forget:** the failure is silent. TypeScript compiles, the app starts, and the admin panel simply does not show the new field — no error, no warning. If a collection field you just added isn't showing up in the admin UI, the fix is almost always to create and run the missing migration, not to debug the collection config.

## Production rules

This shop is deployed and live. These rules are not negotiable, and they are not overridden by a plan, a task brief, or an instruction to "keep going".

- **Never commit directly to `main`.** Make changes on a new branch and open a pull request.
- **Never merge a pull request yourself.** Open it, say it is ready, and stop. The human checks the change on the sandbox deployment and merges it.
- **Never commit or merge directly to the `production` branch.** Production is promoted only by merging `main` into it, only after the human has checked the sandbox deployment, and only through a pull request they merge themselves.
- **Never run anything that could delete or overwrite the production database.** The seed script's `SEED_ALLOW_UNSAFE` override exists for a human to use deliberately; it is not for an agent. `scripts/seed.ts` is a development fixture tool only.
- **Never create content in production to make a check pass.** Products, prices and photos are the owner's, created in the production admin panel. Seeded fixtures belong in development, where they are obviously fake.

**Why the merge rule matters most.** The other rules prevent an accident. This one preserves a checkpoint. An agent can verify a deploy after the fact, but only a human can look at a change and decide it should reach users. Merging on the agent's own judgement removes that decision without anyone noticing it is gone — the app still works, the tests still pass, and the only thing missing is the person who was supposed to say yes.

@AGENTS.md

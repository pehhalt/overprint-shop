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

@AGENTS.md

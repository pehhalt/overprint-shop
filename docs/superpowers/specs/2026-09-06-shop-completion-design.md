# Design — completing the shop: fulfilment, legal pages, and disclosure

**Date:** 2026-09-06
**Status:** approved, ready for implementation planning
**Supersedes nothing.** Extends [`2026-09-04-shop-design.md`](./2026-09-04-shop-design.md), which remains accurate for everything already built.

---

## 1. Why this exists

The shop satisfies its coursework brief completely and is deployed, but it is not a
believable shop. Three audits and one conversation established the gap:

- **It takes money and cannot say where to send the goods.** Stripe Checkout was configured
  for payment only. No address, no phone, no consent — all of which Checkout collects with
  configuration rather than code.
- **The owner cannot mark an order fulfilled.** `Orders` sets `update: () => false`, a
  decision made to protect payment integrity that also removed the ability to operate the
  shop at all.
- **It publishes AI-generated images as photographs, with no disclosure.** All four product
  images carry signed C2PA manifests identifying them as `gpt-image` output
  (`trainedAlgorithmicMedia`). The EU AI Act's Art. 50(4) disclosure duty came into force on
  2 August 2026.
- **It collects personal data with no privacy information, no contact point, and no way to
  exercise erasure.** A GDPR audit rated several of these Critical.

These are one change rather than four, because the last two are what make the first two
lawful. Adding address collection without the legal pages makes the position worse, not
better.

## 2. Decisions taken before design

Three questions were settled by the project owner and constrain everything below.

**The shop is a permanent demonstration.** It will never sell anything real, never leave
Stripe's sandbox, and never ship goods. Therefore: *credible and honest* beats
*operationally complete*. Where a real shop would need stock control, VAT handling and a
returns process, this one needs to be obviously and truthfully a demonstration.

**No full Impressum.** German §5 DDG attaches to commercial services. Rather than publishing
the owner's home address, the site will carry a prominent, unambiguous notice that it is a
non-commercial student demonstration selling nothing, plus a working contact email. This is
a considered position, not an oversight — recorded here so a reviewer sees the reasoning.
It is not legal advice; if the shop ever became commercial, a full Impressum would be
required.

**Germany only, free shipping.** `allowed_countries: ['DE']`, no `shipping_options`. This
demonstrates address collection completely while avoiding cross-border VAT questions a
demonstration shop cannot honestly answer.

## 3. Scope

### In

- Shipping address and terms consent at Stripe Checkout
- Storing the shipping address on the order, read from the correct API field
- A fulfilment status the owner can change, without weakening payment integrity
- An admin view that shows the owner what to send and where
- A legal page: student-project notice, contact, privacy policy, AI disclosure
- A visible AI-generated label on product images
- An extended demonstration banner
- Erasure and export scripts for data subject rights
- A stated retention policy, and a sweeper that enforces part of it

### Out

- Sizes, variants, stock, a multi-item cart
- Shipping rates, VAT, tax calculation
- Order confirmation emails
- Customer accounts
- Rate limiting on `/shop/checkout` (a real finding, but a separate concern — see §13)
- Anything that leaves Stripe sandbox

## 4. Checkout: collect what a shop needs

`src/app/(frontend)/shop/checkout/route.ts`, added to the existing session creation:

```ts
shipping_address_collection: { allowed_countries: ['DE'] },
consent_collection: { terms_of_service: 'required' },
```

**No phone number.** `phone_number_collection` is available and deliberately not used: we
have no purpose for a phone number, and collecting data without a purpose is exactly the
minimisation failure the GDPR audit raised about `orders.email`.

**Prerequisite, external to the code:** `consent_collection.terms_of_service: 'required'`
requires a Terms of Service URL configured in Stripe's dashboard (Settings → Checkout and
Payment Links). Until that is set, session creation will fail. The implementation must
verify this against the live sandbox before relying on it, and the failure must be caught by
the existing error handling rather than surfacing as an unhandled 500.

`managed_payments: { enabled: false }` stays. Whether it interacts with shipping is
**unverified** — the implementation must test session creation against the real sandbox
rather than assume, exactly as was done when that flag was first added.

## 5. Webhook: read the right field

`src/app/(frontend)/shop/stripe-webhook/route.ts`.

The collected address arrives on `checkout.session.completed`. **It must be read from
`session.collected_information.shipping_details`, not `session.shipping_details`.**

Stripe moved this field in the Basil API version (2025-03-31). This endpoint is pinned to
`2026-08-26.dahlia`, well after. The old top-level path is what most documentation and
training data still shows, and on our version it yields `undefined` — so the failure mode is
silent: Stripe collects and displays the address, the customer sees it confirmed, and we
store nothing. It would be discovered when someone tried to post a shirt.

Everything else about the handler is unchanged. Signature verification, idempotency, the
`payment_status` check and the orphan log all stay exactly as they are.

## 6. Orders: new fields, and field-level access

### New fields

| Field | Type | Notes |
|---|---|---|
| `shippingName` | text | from `collected_information.shipping_details.name` |
| `shippingAddress` | group | `line1`, `line2`, `city`, `postalCode`, `country` — all text |
| `fulfilmentStatus` | select | `unfulfilled` (default) \| `shipped`. Required |
| `fulfilledAt` | date | set automatically; see below |

`fulfilledAt` is **not** set by hand. A `beforeChange` hook on the collection sets it to the
current time when `fulfilmentStatus` transitions to `shipped`, and clears it if the status
returns to `unfulfilled`. The field is therefore read-only in the admin panel, like the
payment timestamps — an owner marks an order shipped, and the system records when. Leaving
it hand-editable would let the two disagree.

`shippingAddress` is a group rather than five flat fields so the admin panel renders it as a
block and the erasure script can clear it as a unit.

### The access-control change, which is the delicate part

`Orders` currently sets `create`, `update` and `delete` to `() => false` for every HTTP
path. That protects payment integrity and is why an order can only become `paid` through the
verified webhook. It also makes the shop inoperable.

**Collection-level `update` opens to `isLoggedIn`. Every field that matters gets
field-level access closing it again.**

Payload supports per-field access control (`access: { update }` on a field). So:

- `fulfilmentStatus` and `fulfilledAt` — admin-writable
- `status`, `paidAt`, `amountTotal`, `stripeCheckoutSessionId`, `stripePaymentIntentId`,
  `items`, `email`, `shippingName`, `shippingAddress` — **`update: () => false`**

The webhook is unaffected: it writes through the Local API with `overrideAccess: true`,
which bypasses field access as it already bypasses collection access.

`create` and `delete` stay `() => false` at collection level. Nothing creates an order but
checkout; nothing deletes one but the erasure script, which runs server-side with
`overrideAccess`.

**This must be tested, not assumed.** The existing `orders-access.int.spec.ts` proves the
current lockdown; it will need extending to prove the new, more nuanced rule:

- an admin can change `fulfilmentStatus` through the REST API
- an admin **cannot** change `status`, `paidAt` or `amountTotal` through any HTTP path
- an unauthenticated caller can still change nothing
- the webhook can still write everything

The third and fourth cases already pass today and must keep passing. The second is the new
guarantee and the one worth writing first.

## 7. Admin: an order the owner can actually work

`Orders.admin.defaultColumns` gains `fulfilmentStatus` and `shippingName` so the list view
answers "what do I need to send, and to whom" without opening each record.

No custom admin components. Payload generates the edit view from the fields, and the
field-level access above means the owner sees the money and status fields as read-only
rather than being able to edit and fail.

## 8. Legal page

A single route, `src/app/(frontend)/legal/page.tsx`, linked from a footer in the
`(frontend)` layout so it appears on every storefront page. One page rather than several,
because a demonstration shop with four separate policy pages is theatre.

Sections, in this order:

1. **What this is.** A non-commercial student demonstration built for a course. Nothing is
   for sale, no goods are shipped, all payments run in Stripe's test mode, and no real
   money can change hands. State plainly that visitors should not enter real card details
   or a real address.
2. **Who runs it.** The owner's name and a working contact email. No postal address, per
   §2.

   **This is an input the implementation cannot invent.** The owner must supply the name and
   the email address to publish. It should be an address they are willing to have on a
   public page indefinitely — a role address rather than a primary personal one is worth
   considering, since it will be scraped. Implementation stops and asks rather than
   guessing or using a placeholder; a legal page with a fake contact is worse than no legal
   page, because it claims a route to redress that does not exist.
3. **AI-generated images.** See §9.
4. **Privacy.** Covering, in plain language: what is collected (email, name, shipping
   address, order contents — and card details by Stripe, never by us); why; the lawful
   basis for each; who processes it (Vercel and Supabase as processors, **Stripe as an
   independent controller for payment processing**, which is a real distinction the GDPR
   audit corrected); where it is stored (AWS eu-west-1, functions pinned to `dub1`); how
   long it is kept (§12); and how to exercise access, rectification, erasure and
   portability — by emailing the contact address.
5. **Not legal advice.** A line noting this page is a student project's good-faith attempt,
   not a professionally drafted policy.

## 9. AI-generated image disclosure

**This is the only item in this design whose legal deadline has already passed.**

Two changes:

**A visible label on the images themselves.** Every product image on the catalogue and the
product page carries the text **"AI-generated image"** as a caption directly beneath it —
not a tooltip, not a hover state, not an overlay that could be mistaken for part of the
artwork. It must be legible at normal size on a phone, and present in the server-rendered
HTML rather than added by client-side JavaScript, so it is there for anyone who reads the
page at all. A policy page alone is not sufficient: the duty is to disclose to the person
looking at the content, where they are looking at it.

**A provenance field on `media`.** A `generatedBy` select — `ai` \| `photograph` \|
`unknown`, defaulting to `unknown` — so the system can *represent* the fact it must
disclose. Today it cannot: the collection has only `alt`, so the owner has nowhere to record
how an image was made and the frontend has nothing to render a label from. The four existing
images get set to `ai`.

Labelling is driven by that field, not hardcoded, so a real photograph uploaded later is not
mislabelled.

**Vocabulary.** The `products.photo` field is renamed `image`, and `CLAUDE.md` and
`README.md` stop calling it a "mockup photo". The current naming actively asserts
photographic authenticity, which is the impression the disclosure duty exists to correct.
This is a schema change and therefore needs a migration.

**Do not add image resizing.** Payload currently stores original bytes, which is the only
reason the C2PA provenance manifests survive. `sharp` strips metadata by default. Adding
`imageSizes`, `resizeOptions`, or adopting `next/image`, would silently destroy the
machine-readable evidence of what these images are. If image optimisation is ever wanted, it
must preserve metadata explicitly. This is recorded in `CLAUDE.md` as a constraint.

## 10. Banner

The existing demonstration banner gains one clause: do not enter a **real address** either.
Collecting an address in a shop that never ships is only honest if the notice says so.

## 11. Data subject rights

Two scripts, `scripts/erase-order.ts` and `scripts/export-order.ts`, each taking an email or
a checkout session id.

- **Export** writes matching orders to JSON — satisfying access and portability.
- **Erase** clears the personal fields (`email`, `shippingName`, `shippingAddress`) and
  leaves the transactional record (amount, status, timestamps, line-item snapshots) intact.

Erasure **redacts rather than deletes the row**, because the order total and date are
commercial records with their own retention basis, while the identity is not. A redacted
order is no longer personal data in our system, which is what Art. 17 asks for.

Both run server-side through the Local API with `overrideAccess: true`, reusing the seed
script's production guard so neither can be pointed at the wrong database by accident. They
must refuse to run without an explicit confirmation flag.

**A limit to state honestly on the legal page:** we cannot erase from Stripe. Stripe is an
independent controller with its own regulatory retention obligations, so a customer wanting
full erasure must also contact Stripe. Saying so is more useful than implying a completeness
we cannot deliver.

## 12. Retention

Two numbers, published on the legal page and enforced where enforcement is cheap:

- **Unpaid orders** — `pending` or `expired` — deleted after **30 days**. These accumulate
  on every abandoned checkout and have no commercial or legal purpose.
- **Paid orders** — retained **2 years**, then redacted by the same routine as erasure.
  Short for a real shop, which would keep commercial records far longer under tax law, and
  appropriate for a demonstration that never made a real sale.

A `scripts/prune-orders.ts` implements both. It is run manually; a demonstration shop does
not need a scheduled job, and claiming automated enforcement we do not have would be worse
than documenting a manual process honestly.

## 13. Explicitly not in this change

- **Rate limiting on `/shop/checkout`.** Real (both audits raised it), and worse than it
  looks — a flood exhausts the 3-connection pool and 504s the whole site. But it is an
  availability concern with a different shape and a platform-level fix (Vercel Firewall),
  and folding it in would blur this change's purpose.
- **`npm test` connection exhaustion.** Known, documented in the README, fix is a vitest
  config change.
- **Marking Vercel env vars sensitive.** The security review flagged that `PAYLOAD_SECRET`
  being readable permits admin session forgery. Fixing it means abandoning the prebuilt
  deploy pattern; it deserves its own decision.
- **Sizes.** `custom_fields` could carry one as a dropdown without a variant model, which is
  tempting and wrong to bundle here — it changes what a product *is*.

## 14. Testing

- **Checkout** — session creation includes `shipping_address_collection` and
  `consent_collection`; existing tests keep passing.
- **Webhook** — a fixture event carrying `collected_information.shipping_details` results in
  the address being stored. **A fixture using the old top-level `shipping_details` must
  result in no address being stored**, proving we read the correct field rather than
  accidentally passing because a test used the same shape as the code.
- **Field access** — the four cases in §6.
- **Erasure** — personal fields cleared, transactional fields intact, order still present.
- **Legal page** — renders, and is reachable from a footer link on every storefront page.
- **Image labelling** — a `generatedBy: 'ai'` image renders the label; a `photograph` one
  does not.

Tests follow existing conventions: real database, `tests/int/*.int.spec.ts`, fixtures
cleaned up in `afterAll`, no interference with the three seeded products.

## 15. Risks

| Risk | Mitigation |
|---|---|
| `consent_collection` fails without a ToS URL set in Stripe's dashboard | Verify against the live sandbox early; it is a prerequisite, not a code problem |
| `managed_payments: false` interacts badly with shipping collection | Test session creation against the real sandbox before building on it |
| Reading the wrong `shipping_details` path — silent failure | A test that proves the old path does *not* work |
| Opening collection-level `update` weakens payment integrity | Field-level access on every money and status field, with tests for each |
| Renaming `photo` → `image` breaks the frontend or seed | Schema change with a migration; typecheck and the e2e suite catch the rest |
| Adding image resizing later destroys C2PA provenance | Recorded as a constraint in `CLAUDE.md` |

## 16. What this design is not

It is not legal advice. The privacy content, the §5 DDG position, and the Art. 50(4)
analysis are a good-faith reading informed by two automated audits, and both audits said
plainly that they are a first-pass signal rather than a substitute for a qualified lawyer.
For a demonstration shop that sells nothing, that is a proportionate position. It would not
be, for a shop taking real money.

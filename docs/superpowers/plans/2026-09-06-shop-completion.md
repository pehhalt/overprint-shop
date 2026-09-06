# Shop Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a shop that takes money into one that could plausibly deliver — sizes, a shipping address, a fulfilment workflow — and make it lawful to run, with a legal page, an AI-content disclosure, and working data-subject rights.

**Architecture:** Stripe Checkout collects the address and consent by configuration rather than code; the webhook stores what it returns. `Orders` opens collection-level `update` to admins while closing every money and status field individually, so the owner can operate the shop without anyone being able to hand-edit an order to `paid`. A `generatedBy` field on `media` lets the system represent, and therefore disclose, that its product images are AI-generated.

**Tech Stack:** Next.js 16 (App Router) · Payload CMS 3.88 · Supabase Postgres · Vercel Blob · Stripe Checkout (sandbox) · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-09-06-shop-completion-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22.** Prefix every bash command with `export PATH="/c/Program Files/Volta:$PATH"` and run node/npm/npx through Volta: `volta run --node 22 -- npm test`. Never bare `node`/`npm`/`npx`.
- **Never merge a pull request.** Open it, report, stop. See `CLAUDE.md` → Production rules.
- **Never commit to `main` or `production`.** Feature branches only.
- **Schema changes need a migration.** `push: false` everywhere; forgetting is a silent failure. `npx payload migrate:create <name>` then `npx payload migrate`, and commit the migration.
- **Prices are integers in minor units (cents).** Division happens only inside `formatPrice`.
- **The server never trusts the client** for price, name, amount — and now size.
- **An order is marked paid only by the signature-verified webhook.**
- **Sizes are exactly `['S', 'M', 'L', 'XL']`.**
- **Shipping is Germany only:** `allowed_countries: ['DE']`.
- **Published contact:** name `Overprint — a student project by Peter`, email `overprintdemoshop@gmail.com`. Verbatim, no placeholder.
- **Do not add image resizing.** `imageSizes`, `resizeOptions` or `next/image` would strip the C2PA provenance manifests that prove the images are AI-generated.
- **`npm test` needs `--no-file-parallelism`** or it exhausts Supabase's 15-connection limit.
- Tests live in `tests/int/*.int.spec.ts`, use the real database, and clean up in `afterAll`. Never disturb the three seeded products or `dev@overprint.local`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/lib/constants.ts` | Add `SIZES`, `Size`, `SIZE_DEFAULT`, `isValidSize` |
| `src/collections/Orders.ts` | New address/fulfilment fields, field-level access, `fulfilledAt` hook |
| `src/collections/Media.ts` | New `generatedBy` provenance field |
| `src/app/(frontend)/shop/checkout/route.ts` | Size validation, address/consent/card-only session params |
| `src/app/(frontend)/shop/stripe-webhook/route.ts` | Store the shipping address |
| `src/app/(frontend)/products/[slug]/BuyButton.tsx` | Size selector |
| `src/app/(frontend)/ProductImage.tsx` | **New.** Image + AI disclosure caption |
| `src/app/(frontend)/legal/page.tsx` | **New.** The legal page |
| `src/app/(frontend)/SiteFooter.tsx` | **New.** Footer linking to the legal page |
| `src/app/(frontend)/layout.tsx` | Mount the footer |
| `src/app/(frontend)/DemoBanner.tsx` | Add the "no real address" clause |
| `scripts/export-order.ts` | **New.** Art. 15/20 export |
| `scripts/erase-order.ts` | **New.** Art. 17 redaction |
| `scripts/prune-orders.ts` | **New.** Retention sweeper |
| `src/lib/order-admin.ts` | **New.** Shared lookup + redaction used by all three scripts |
| `src/collections/Products.ts` | Rename `photo` → `image` |
| `src/app/(frontend)/page.tsx` | Use `ProductImage`; rename `photo` → `image` |
| `src/app/(frontend)/products/[slug]/page.tsx` | Use `ProductImage`; rename `photo` → `image` |
| `scripts/seed.ts` | `generatedBy: 'photograph'` on fixtures; rename `photo` → `image`; alt text |

---

# PHASE 1 — Sizes

### Task 1: The size constant and server-side validation

**Files:**
- Modify: `src/lib/constants.ts`
- Modify: `src/app/(frontend)/shop/checkout/route.ts`
- Test: `tests/int/checkout.int.spec.ts`

**Interfaces:**
- Produces: `SIZES: readonly ['S','M','L','XL']`, `SIZE_DEFAULT: 'M'`, `isValidSize(value: unknown): value is Size`, `type Size`.
- Produces: `POST /shop/checkout` now accepts `{ productId: string, size: string }`.

- [ ] **Step 1: Read the existing suite first**

`tests/int/checkout.int.spec.ts` already exists and its conventions are not the ones you
would invent. Note before writing anything:

- Payload is **not** mocked — only `@/lib/stripe`'s `sessions.create` / `sessions.expire`,
  through the hoisted `sessionsCreate` / `sessionsExpire`. Tests run against the real
  development database.
- The fixtures are `availableProductId` and `soldOutProductId` (numbers), created in
  `beforeAll` from `AVAILABLE_NAME` / `AVAILABLE_SLUG` and torn down in `afterAll`. There is
  no `fixtureProductId`.
- `request(body)` builds the `Request`. There is no order-counting helper — the existing
  tests count inline with
  `payload.find({ collection: 'orders', where: { 'items.product': { equals: … } }, overrideAccess: true })`.

Follow those conventions. Do not add a mocking layer the suite deliberately does without.

- [ ] **Step 2: Write the failing tests**

Add to `tests/int/checkout.int.spec.ts`:

```ts
it('rejects a request with no size', async () => {
  const response = await POST(request({ productId: String(availableProductId) }))
  expect(response.status).toBe(400)
  expect(sessionsCreate).not.toHaveBeenCalled()
})

it('rejects an invented size, creating no Stripe session and no order row', async () => {
  const before = await payload.find({
    collection: 'orders',
    where: { 'items.product': { equals: availableProductId } },
    overrideAccess: true,
  })

  for (const bad of ['XXL', '<script>', '', 'm ', 's', 42, null]) {
    const response = await POST(request({ productId: String(availableProductId), size: bad }))
    expect(response.status, `size ${JSON.stringify(bad)} should be refused`).toBe(400)
  }
  expect(sessionsCreate).not.toHaveBeenCalled()

  const after = await payload.find({
    collection: 'orders',
    where: { 'items.product': { equals: availableProductId } },
    overrideAccess: true,
  })
  expect(after.totalDocs).toBe(before.totalDocs)
})

it('puts the chosen size in the Stripe line item name', async () => {
  sessionsCreate.mockResolvedValue({
    id: SESSION_ID_SIZE_TEST,
    url: 'https://checkout.stripe.com/size',
  })

  await POST(request({ productId: String(availableProductId), size: 'L' }))

  const args = sessionsCreate.mock.calls[0][0]
  expect(args.line_items[0].price_data.product_data.name).toBe(`${AVAILABLE_NAME} — L`)
})
```

Add `const SESSION_ID_SIZE_TEST = 'task10-fixture-cs_test_size_in_line_item'` alongside the
other session-id constants, and clean up the order it creates in `afterAll` the way the
suite already cleans up the others.

`42` and `null` are in the invalid list because `size` arrives as `unknown` from
`req.json()` — a check written as `!SIZES.includes(size)` against an untyped value is the
bug they catch. `'m '` and `'s'` are there because validation is exact-match: not trimmed,
not case-folded. If an implementer wants normalisation, change these tests deliberately
rather than loosening them quietly.

- [ ] **Step 3: Give the existing tests a size**

**Not cleanup — a prerequisite.** Every existing test in this file posts
`request({ productId: … })` with no size. The moment size is required they all return 400
and the suite goes red for reasons unrelated to what they assert. Add `size: 'M'` to the
body in each of:

- `charges the database price, not one supplied by the client`
- `writes a pending order carrying the checkout session id…`
- `refuses a sold-out product with 409…` — it passes a *valid* size, so the sold-out check
  is still the thing that fires
- `disables Managed Payments on the created session…`
- `returns 502 with a JSON error body when Stripe fails…`

Leave `rejects a request with no productId with 400` posting `{}`. It asserts the productId
guard and must keep passing whichever guard fires first.

- [ ] **Step 4: Run and confirm the new tests fail**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/checkout.int.spec.ts`
Expected: the three new tests FAIL — `SIZES` is not exported and the handler ignores `size`.
The existing tests still pass, because Step 3 gave them a size the handler currently ignores.

- [ ] **Step 5: Add the constants**

In `src/lib/constants.ts`:

```ts
/** Every shirt is available in these sizes. A catalogue-wide property, like CURRENCY —
 *  deliberately not a per-product field, because every shirt comes in all four. */
export const SIZES = ['S', 'M', 'L', 'XL'] as const
export type Size = (typeof SIZES)[number]
export const SIZE_DEFAULT: Size = 'M'

export function isValidSize(value: unknown): value is Size {
  return typeof value === 'string' && (SIZES as readonly string[]).includes(value)
}
```

- [ ] **Step 6: Validate in the handler**

In `src/app/(frontend)/shop/checkout/route.ts`, extend the body type and add the guard immediately after the existing `productId` check:

```ts
const body = (await req.json().catch(() => null)) as
  | { productId?: unknown; size?: unknown }
  | null
const productId = body?.productId
const size = body?.size

// ... existing productId guard ...

if (!isValidSize(size)) {
  return NextResponse.json({ error: 'A valid size is required' }, { status: 400 })
}
```

Then use it in the line item:

```ts
product_data: { name: `${product.name} — ${size}` },
```

- [ ] **Step 7: Run and confirm they pass**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/checkout.int.spec.ts`
Expected: PASS — all nine tests in the file, the six pre-existing ones included.

- [ ] **Step 8: Commit**

```bash
git add src/lib/constants.ts "src/app/(frontend)/shop/checkout/route.ts" tests/int/checkout.int.spec.ts
git commit -m "Validate the chosen shirt size server-side"
```

---

### Task 2: Store the size on the order

**Files:**
- Modify: `src/collections/Orders.ts`
- Modify: `src/app/(frontend)/shop/checkout/route.ts`
- Create: `src/migrations/<generated>_order_size.ts`
- Test: `tests/int/checkout.int.spec.ts`
- Modify (fixtures): `tests/int/orders-access.int.spec.ts`, `tests/int/webhook.int.spec.ts`

**Interfaces:**
- Produces: `orders.items[].sizeSnapshot: string` (required).

- [ ] **Step 1: Write the failing test**

```ts
it('snapshots the chosen size on the order line', async () => {
  sessionsCreate.mockResolvedValue({
    id: SESSION_ID_SIZE_SNAPSHOT_TEST,
    url: 'https://checkout.stripe.com/snapshot',
  })

  await POST(request({ productId: String(availableProductId), size: 'XL' }))

  const found = await payload.find({
    collection: 'orders',
    where: { stripeCheckoutSessionId: { equals: SESSION_ID_SIZE_SNAPSHOT_TEST } },
    overrideAccess: true,
  })
  expect(found.totalDocs).toBe(1)
  expect(found.docs[0].items[0].sizeSnapshot).toBe('XL')
})
```

Add `const SESSION_ID_SIZE_SNAPSHOT_TEST = 'task10-fixture-cs_test_size_snapshot'` with the
other session-id constants, and clean up the order it creates in `afterAll`.

- [ ] **Step 2: Run and confirm it fails**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/checkout.int.spec.ts`
Expected: FAIL — no such field.

- [ ] **Step 3: Add the field**

In `src/collections/Orders.ts`, inside the `items` array's `fields`, after `unitAmountSnapshot`:

```ts
{
  name: 'sizeSnapshot',
  type: 'text',
  required: true,
  admin: { description: 'The size chosen at purchase. What the owner prints.' },
},
```

- [ ] **Step 4: Write it in the handler**

In the `payload.create` call in the checkout route, add to the item:

```ts
sizeSnapshot: size,
```

- [ ] **Step 5: Fix the two other suites' order fixtures**

`required: true` on `sizeSnapshot` is a typed change to every place an order is constructed,
and two of those places are in tests this task does not otherwise touch:

- `tests/int/orders-access.int.spec.ts` → `fixtureOrderPayload()`
- `tests/int/webhook.int.spec.ts` → `fixtureOrderData()`

Both build `items: [{ nameSnapshot, unitAmountSnapshot, quantity }]`. Add `sizeSnapshot: 'M'`
to each. Without it the generated create-data type stops accepting them and both suites fail
to compile — the same quirk their own comments already describe for `status`, where
`defaultValue` fills in at the database layer but not in the Local API's TypeScript surface.

- [ ] **Step 6: Generate and read the migration**

```bash
volta run --node 22 -- npx payload migrate:create order_size
volta run --node 22 -- npx payload migrate
```

Open the generated `.ts` and confirm it adds `size_snapshot` to `orders_items` and nothing
else. Existing order rows have no size, so a `NOT NULL` column with no default will fail
against a database that already holds orders. Nullable at the database level while
`required: true` in Payload is the right answer: the constraint belongs where new writes go
through, and history should not be back-filled with a size nobody chose. A migration you
have not read is a migration you cannot trust.

- [ ] **Step 7: Regenerate types, run, commit**

```bash
volta run --node 22 -- npm run generate:types
volta run --node 22 -- npm test -- --no-file-parallelism
git add -A && git commit -m "Snapshot the ordered size on the order line"
```

---

### Task 3: The size selector

**Files:**
- Modify: `src/app/(frontend)/products/[slug]/BuyButton.tsx`
- Test: `tests/e2e/size-selection.e2e.spec.ts`

**Interfaces:**
- Consumes: `SIZES`, `SIZE_DEFAULT` from `@/lib/constants`.
- `BuyButton` props are unchanged: `{ productId: string; soldOut: boolean }`.

- [ ] **Step 1: Add the selector**

`BuyButton` is already a client component. Add size state and a set of radio-style buttons above the existing buy button:

```tsx
const [size, setSize] = useState<Size>(SIZE_DEFAULT)
```

Render one button per entry in `SIZES`, with the selected one visually distinct. Use `aria-pressed` so the state is available to assistive technology, and give the group an accessible label ("Size"). Match the existing Tailwind vocabulary — look at the current file before writing any classes.

Send the size with the request:

```tsx
body: JSON.stringify({ productId, size }),
```

The sold-out branch returns before any of this, unchanged.

- [ ] **Step 2: Write the end-to-end test**

`tests/e2e/size-selection.e2e.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('a size can be chosen and defaults to M', async ({ page }) => {
  await page.goto('/products/midnight-tee')
  await expect(page.getByRole('button', { name: 'M', pressed: true })).toBeVisible()
  await page.getByRole('button', { name: 'L', exact: true }).click()
  await expect(page.getByRole('button', { name: 'L', pressed: true })).toBeVisible()
})
```

- [ ] **Step 3: Run it**

Run: `volta run --node 22 -- npx playwright test size-selection`
Expected: PASS.

- [ ] **Step 4: Full suite, then commit**

```bash
volta run --node 22 -- npx playwright test
volta run --node 22 -- npm run lint && volta run --node 22 -- npm run typecheck
git add -A && git commit -m "Let the customer choose a size before buying"
```

---

# PHASE 2 — Address and fulfilment

### Task 4: Collect the address, consent, and card-only

**Files:**
- Modify: `src/app/(frontend)/shop/checkout/route.ts`
- Test: `tests/int/checkout.int.spec.ts`

**Interfaces:**
- Produces: sessions created with `shipping_address_collection`, `consent_collection`, `payment_method_types`.

- [ ] **Step 1: Confirm the Stripe prerequisite before writing code**

`consent_collection: { terms_of_service: 'required' }` requires a Terms of Service URL set in Stripe's dashboard (Settings → Checkout and Payment Links). Verify by creating a real session against the sandbox:

```bash
cd /c/Projects/TuringCollege/BwAI/overprint-shop
SK=$(grep -m1 '^STRIPE_SECRET_KEY=' .env | cut -d= -f2- | tr -d '\r')
curl -sS -o /tmp/s.json -w "%{http_code}\n" https://api.stripe.com/v1/checkout/sessions \
  -u "$SK:" -d mode=payment \
  -d "line_items[0][quantity]=1" \
  -d "line_items[0][price_data][currency]=eur" \
  -d "line_items[0][price_data][unit_amount]=2300" \
  -d "line_items[0][price_data][product_data][name]=Prereq check — M" \
  -d "managed_payments[enabled]=false" \
  -d "shipping_address_collection[allowed_countries][]=DE" \
  -d "consent_collection[terms_of_service]=required" \
  -d "payment_method_types[]=card" \
  --data-urlencode "success_url=https://overprint-shop.vercel.app/order/success?session_id={CHECKOUT_SESSION_ID}" \
  --data-urlencode "cancel_url=https://overprint-shop.vercel.app/"
head -c 400 /tmp/s.json
```

Expected: `200`. If it returns 400 saying a Terms of Service URL is required, **stop and report** — the owner must set it in the dashboard. Do not work around it by dropping `consent_collection`.

This also confirms `managed_payments: false` and shipping collection coexist, which the spec flags as unverified.

- [ ] **Step 2: Write the failing test**

```ts
it('collects a German shipping address, terms consent, and card only', async () => {
  sessionsCreate.mockResolvedValue({
    id: SESSION_ID_COLLECTION_TEST,
    url: 'https://checkout.stripe.com/collect',
  })

  await POST(request({ productId: String(availableProductId), size: 'M' }))

  const args = sessionsCreate.mock.calls[0][0]
  expect(args.shipping_address_collection).toEqual({ allowed_countries: ['DE'] })
  expect(args.consent_collection).toEqual({ terms_of_service: 'required' })
  expect(args.payment_method_types).toEqual(['card'])
})
```

`SESSION_ID_COLLECTION_TEST = 'task10-fixture-cs_test_address_collection'`, declared and
cleaned up like the others.

- [ ] **Step 3: Run and confirm it fails**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/checkout.int.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Add the parameters**

In the `sessions.create` call, alongside the existing `managed_payments`:

```ts
shipping_address_collection: { allowed_countries: ['DE'] },
consent_collection: { terms_of_service: 'required' },
// Card only. Not because Klarna or Amazon Pay would break anything — every method
// produces the same paid webhook — but Apple Pay needs domain verification and fails
// confusingly without it, and the graded demonstration is the two-card test.
payment_method_types: ['card'],
```

- [ ] **Step 5: Run, then commit**

```bash
volta run --node 22 -- npm test -- --no-file-parallelism
git add -A && git commit -m "Collect a shipping address and terms consent at checkout"
```

---

### Task 5: Store the shipping address from the webhook

**Files:**
- Modify: `src/collections/Orders.ts`
- Modify: `src/app/(frontend)/shop/stripe-webhook/route.ts`
- Create: `src/migrations/<generated>_order_shipping.ts`
- Test: `tests/int/webhook.int.spec.ts`

**Interfaces:**
- Produces: `orders.shippingName: string`, `orders.shippingAddress: { line1, line2, city, postalCode, country }`.

- [ ] **Step 1: Write the two failing tests**

The suite's helpers are `completedEvent(sessionId, paymentStatus)` — two arguments — and
`findOrderBySessionId(payload, sessionId)`. Each test needs its own fixture session id,
declared with the others and added to `ALL_FIXTURE_SESSION_IDS` so `afterAll` cleans it up,
with a `pending` fixture order created for it in `beforeAll` the way the existing paid-path
tests do. `SESSION_ORPHAN` stays out of that list on purpose; do not copy it as a pattern.

```ts
const SESSION_SHIPPING = 'cs_test_task11_shipping_collected_information'
const SESSION_SHIPPING_LEGACY = 'cs_test_task11_shipping_legacy_shape'
```

The second test is the important one.

```ts
it('stores the shipping address from collected_information', async () => {
  const event = completedEvent(SESSION_SHIPPING, 'paid')
  ;(event.data.object as Record<string, unknown>).collected_information = {
    shipping_details: {
      name: 'Erika Mustermann',
      address: {
        line1: 'Musterstraße 1', line2: null, city: 'Berlin',
        postal_code: '10115', country: 'DE',
      },
    },
  }

  const response = await POST(signedRequest(event))
  expect(response.status).toBe(200)

  const order = await findOrderBySessionId(payload, SESSION_SHIPPING)
  expect(order?.shippingName).toBe('Erika Mustermann')
  expect(order?.shippingAddress?.city).toBe('Berlin')
  expect(order?.shippingAddress?.postalCode).toBe('10115')
  expect(order?.shippingAddress?.country).toBe('DE')
})

it('ignores a top-level shipping_details, which is the pre-Basil shape', async () => {
  const event = completedEvent(SESSION_SHIPPING_LEGACY, 'paid')
  // Stripe moved this field into collected_information in the Basil API version. This
  // endpoint is pinned after that, so the old path must NOT be read. A handler that read
  // it would pass a test written in the same shape and silently store nothing in
  // production — which is exactly the failure this test exists to prevent.
  ;(event.data.object as Record<string, unknown>).shipping_details = {
    name: 'Wrong Path', address: { line1: 'Nowhere', city: 'Nowhere', country: 'DE' },
  }

  const response = await POST(signedRequest(event))
  expect(response.status).toBe(200)

  const order = await findOrderBySessionId(payload, SESSION_SHIPPING_LEGACY)
  expect(order?.status).toBe('paid')
  expect(order?.shippingName).toBeFalsy()
})
```

The `status` assertion in the second test matters: without it the test would also pass if
the handler had thrown outright, which would prove nothing about which field was read.

- [ ] **Step 2: Run and confirm both fail**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/webhook.int.spec.ts`
Expected: FAIL — no such fields.

- [ ] **Step 3: Add the fields**

In `src/collections/Orders.ts`, after `email`:

```ts
{ name: 'shippingName', type: 'text' },
{
  name: 'shippingAddress',
  type: 'group',
  fields: [
    { name: 'line1', type: 'text' },
    { name: 'line2', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'postalCode', type: 'text' },
    { name: 'country', type: 'text' },
  ],
},
```

A group rather than five flat fields, so the admin panel renders it as a block and the erasure script can clear it as a unit.

- [ ] **Step 4: Read it in the webhook**

In the paid-update branch:

```ts
// Stripe moved this from the top level to collected_information in the Basil API
// version (2025-03-31). This endpoint is pinned to 2026-08-26.dahlia, so the old
// path yields undefined — and that is the path most documentation still shows.
const shipping = session.collected_information?.shipping_details
```

and add to the update `data`:

```ts
shippingName: shipping?.name ?? undefined,
shippingAddress: shipping?.address
  ? {
      line1: shipping.address.line1 ?? undefined,
      line2: shipping.address.line2 ?? undefined,
      city: shipping.address.city ?? undefined,
      postalCode: shipping.address.postal_code ?? undefined,
      country: shipping.address.country ?? undefined,
    }
  : undefined,
```

If the SDK's types do not expose `collected_information`, narrow the cast to that one property. Do **not** cast the whole session object — that would switch off type checking on `payment_status`, which is the field this handler's correctness depends on.

- [ ] **Step 5: Migration, types, run, commit**

```bash
volta run --node 22 -- npx payload migrate:create order_shipping
volta run --node 22 -- npx payload migrate
volta run --node 22 -- npm run generate:types
volta run --node 22 -- npm test -- --no-file-parallelism
git add -A && git commit -m "Store the shipping address, from the field Basil moved"
```

---

### Task 6: Fulfilment status, with field-level access

**This is the most delicate task in the plan.** It reopens a door that was deliberately closed.

**Files:**
- Modify: `src/collections/Orders.ts`
- Create: `src/migrations/<generated>_order_fulfilment.ts`
- Test: `tests/int/orders-access.int.spec.ts`

**Interfaces:**
- Produces: `orders.fulfilmentStatus: 'unfulfilled' | 'shipped'`, `orders.fulfilledAt: string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/int/orders-access.int.spec.ts` has no PATCH helper — it has
`postOrderOverRest(body, token?)`, built on the generated `POST` export from
`@/app/(payload)/api/[...slug]/route`. That module also exports `PATCH`. Add a sibling
helper in the same shape, and import `PATCH as ordersApiPatch` alongside the existing
`POST as ordersApiPost`:

```ts
async function patchOrderOverRest(
  id: number,
  body: unknown,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `JWT ${token}`
  }

  const request = new Request(`http://localhost:3000/api/orders/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })

  return ordersApiPatch(request, { params: Promise.resolve({ slug: ['orders', String(id)] }) })
}
```

The suite already creates a fixture admin and holds `adminToken`. It does not yet create an
order it intends to *keep* — the existing tests assert that creates are refused. Add one in
`beforeAll` through the Local API with `overrideAccess: true`, using a new
`FIXTURE_SESSION_ID_UPDATE = 'task9-fixture-cs_test_field_level_update'` added to the
`afterAll` cleanup list, and hold its id in `let updatableOrderId: number`.

Four cases. The second is the new guarantee; the third and fourth pass today and must keep
passing.

```ts
it('lets a logged-in admin change fulfilmentStatus over REST', async () => {
  const response = await patchOrderOverRest(
    updatableOrderId,
    { fulfilmentStatus: 'shipped' },
    adminToken,
  )
  expect(response.status).toBe(200)

  const order = await payload.findByID({
    collection: 'orders', id: updatableOrderId, overrideAccess: true,
  })
  expect(order.fulfilmentStatus).toBe('shipped')
  expect(order.fulfilledAt).toBeTruthy()
})

it('refuses that same admin changing status, paidAt or amountTotal', async () => {
  const before = await payload.findByID({
    collection: 'orders', id: updatableOrderId, overrideAccess: true,
  })

  await patchOrderOverRest(
    updatableOrderId,
    { status: 'paid', paidAt: new Date().toISOString(), amountTotal: 1 },
    adminToken,
  )

  const after = await payload.findByID({
    collection: 'orders', id: updatableOrderId, overrideAccess: true,
  })
  expect(after.status).toBe(before.status)
  expect(after.paidAt).toBe(before.paidAt)
  expect(after.amountTotal).toBe(before.amountTotal)
})

it('still refuses an unauthenticated update', async () => {
  const response = await patchOrderOverRest(updatableOrderId, { fulfilmentStatus: 'shipped' })
  expect([401, 403]).toContain(response.status)
})

it('still lets the server write the closed fields through the Local API', async () => {
  const paidAt = new Date().toISOString()
  await payload.update({
    collection: 'orders',
    id: updatableOrderId,
    overrideAccess: true,
    data: { status: 'paid', paidAt },
  })

  const order = await payload.findByID({
    collection: 'orders', id: updatableOrderId, overrideAccess: true,
  })
  expect(order.status).toBe('paid')
})
```

Payload may respond to a field-level refusal either by erroring or by silently dropping the
field, and which one it does is a version detail. That is why the second test asserts on the
stored document rather than on the response status: what must be true is that the values did
not change, whatever HTTP code came back. Run it and see which behaviour you get, then say
so in the report — if it errors, the test is stricter than it looks and that is worth
knowing.

- [ ] **Step 2: Run and confirm the first two fail**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/orders-access.int.spec.ts`
Expected: test 1 FAILS — `fulfilmentStatus` does not exist and collection `update` is
`() => false`. Test 2 passes vacuously for now (nothing can be updated, so nothing changes);
it becomes meaningful only once Step 3 opens `update`, which is precisely the risk it
guards. Tests 3 and 4 pass already. Do not treat test 2's early green as evidence.

- [ ] **Step 3: Open collection update, close every field that matters**

In `src/collections/Orders.ts`, change the access block:

```ts
access: {
  read: isLoggedIn,
  create: () => false,
  // Opened so the owner can mark an order shipped. Every field that must never be
  // hand-edited closes itself below with field-level `access.update`. The webhook is
  // unaffected: it writes with overrideAccess, which bypasses both.
  update: isLoggedIn,
  delete: () => false,
},
```

Then add `access: { update: () => false }` to **every one of** these fields: `stripeCheckoutSessionId`, `stripePaymentIntentId`, `email`, `status`, `amountTotal`, `paidAt`, `items`, `shippingName`, `shippingAddress`.

Add the two new fields, which are the only writable ones:

```ts
{
  name: 'fulfilmentStatus',
  type: 'select',
  required: true,
  defaultValue: 'unfulfilled',
  options: [
    { label: 'Unfulfilled', value: 'unfulfilled' },
    { label: 'Shipped', value: 'shipped' },
  ],
},
{
  name: 'fulfilledAt',
  type: 'date',
  access: { update: () => false },
  admin: { readOnly: true, description: 'Set automatically when marked shipped.' },
},
```

- [ ] **Step 4: Set `fulfilledAt` from a hook, not by hand**

Add to the collection:

```ts
hooks: {
  beforeChange: [
    ({ data, originalDoc }) => {
      const was = originalDoc?.fulfilmentStatus
      const now = data.fulfilmentStatus
      if (now === 'shipped' && was !== 'shipped') data.fulfilledAt = new Date().toISOString()
      if (now === 'unfulfilled' && was === 'shipped') data.fulfilledAt = null
      return data
    },
  ],
},
```

An owner marks an order shipped; the system records when. Leaving the timestamp hand-editable would let the two disagree.

- [ ] **Step 5: Run all four, then migrate**

Run: `volta run --node 22 -- npm test -- --no-file-parallelism tests/int/orders-access.int.spec.ts`
Expected: all four PASS.

```bash
volta run --node 22 -- npx payload migrate:create order_fulfilment
volta run --node 22 -- npx payload migrate
volta run --node 22 -- npm run generate:types
```

- [ ] **Step 6: Surface it in the admin list, then commit**

Set `admin.defaultColumns` on the collection to include `fulfilmentStatus` and `shippingName` alongside what is already there.

```bash
volta run --node 22 -- npm test -- --no-file-parallelism
git add -A && git commit -m "Let the owner mark an order shipped, and nothing else"
```

---

# PHASE 3 — Disclosure and legal

### Task 7: Media provenance and the AI disclosure caption

**Files:**
- Modify: `src/collections/Media.ts`
- Create: `src/app/(frontend)/ProductImage.tsx`
- Modify: `src/app/(frontend)/page.tsx`, `src/app/(frontend)/products/[slug]/page.tsx`
- Create: `src/migrations/<generated>_media_provenance.ts`
- Test: `tests/int/media-provenance.int.spec.ts`

**Interfaces:**
- Produces: `media.generatedBy: 'ai' | 'photograph' | 'unknown'` (default `'unknown'`).
- Produces: `<ProductImage media={…} className={…} />`.

- [ ] **Step 1: Add the provenance field**

In `src/collections/Media.ts`, after `alt`:

```ts
{
  name: 'generatedBy',
  type: 'select',
  required: true,
  defaultValue: 'unknown',
  options: [
    { label: 'AI-generated', value: 'ai' },
    { label: 'Photograph', value: 'photograph' },
    { label: 'Unknown', value: 'unknown' },
  ],
  admin: {
    description:
      'How this image was made. AI-generated images are labelled on the public site — the EU AI Act requires disclosing artificially generated image content.',
  },
},
```

- [ ] **Step 2: Migrate and set the existing images**

```bash
volta run --node 22 -- npx payload migrate:create media_provenance
volta run --node 22 -- npx payload migrate
volta run --node 22 -- npm run generate:types
```

The four production images are AI-generated (verified: their PNGs carry signed C2PA manifests naming `gpt-image` with `digitalSourceType: trainedAlgorithmicMedia`). The **owner** sets them to "AI-generated" in the production admin panel — do not write to the production database from a script. Report this as a required owner action.

For development, update the seed script so its generated fixtures are `generatedBy: 'photograph'`. They are `sharp`-rendered solid colours, not model output; labelling them AI would be untrue and would make the label meaningless.

- [ ] **Step 3: Write the failing test**

`tests/int/media-provenance.int.spec.ts`, rendering the component with `react-dom/server` as `order-success.int.spec.ts` already does:

```ts
it('labels an AI-generated image', () => {
  const html = renderToStaticMarkup(
    <ProductImage media={{ url: '/x.png', alt: 'A shirt', generatedBy: 'ai' }} />,
  )
  expect(html).toContain('AI-generated image')
})

it('does not label a photograph', () => {
  const html = renderToStaticMarkup(
    <ProductImage media={{ url: '/x.png', alt: 'A shirt', generatedBy: 'photograph' }} />,
  )
  expect(html).not.toContain('AI-generated image')
})
```

- [ ] **Step 4: Build the component**

`src/app/(frontend)/ProductImage.tsx` — a server component, no `'use client'`:

```tsx
import type { Media } from '@/payload-types'

type ProductImageProps = {
  /** The populated media document. Both pages already query with `depth: 1`. */
  media: Pick<Media, 'url' | 'alt' | 'generatedBy'>
  /** Passed straight through to the `<img>`, so callers keep their existing classes. */
  className?: string
}

export function ProductImage({ media, className }: ProductImageProps) {
  return (
    <figure>
      <img src={media.url ?? ''} alt={media.alt} className={className} />
      {media.generatedBy === 'ai' && (
        <figcaption className="mt-1 text-xs text-neutral-600">AI-generated image</figcaption>
      )}
    </figure>
  )
}
```

`Pick<Media, …>` rather than the whole `Media` type: the component needs three fields, and a
narrow prop type is what lets the test in Step 3 pass an object literal instead of building a
full media document.

The caption must be in the server-rendered HTML, not added by client JavaScript, and must be readable at normal size — not a tooltip, not a hover state, not an overlay that could read as part of the artwork.

- [ ] **Step 5: Use it on both pages**

Replace the bare `<img>` in `src/app/(frontend)/page.tsx` and `src/app/(frontend)/products/[slug]/page.tsx` with `<ProductImage>`. Both already fetch with `depth: 1`, so the media document is populated. Keep the existing Tailwind classes by passing them through `className`.

- [ ] **Step 6: Run, then commit**

```bash
volta run --node 22 -- npm test -- --no-file-parallelism
volta run --node 22 -- npm run lint && volta run --node 22 -- npm run typecheck
git add -A && git commit -m "Disclose that the product images are AI-generated"
```

---

### Task 8: Rename `products.photo` to `products.image`

**This task belongs here, immediately after Task 7, and not at the end.** It is the other
half of the disclosure work — §9 of the spec asks for it because the field name `photo`,
"mockup photo" in the README, and alt text reading "Front view of…" all assert photographic
authenticity, which is exactly the impression the disclosure duty exists to correct. Doing
it now means touching the image code once; doing it after Task 12 means rewriting the
documentation that task just wrote.

It is also the widest blast radius in the plan: a schema change reaching the collection, two
pages, the seed script, the media delete-guard hook, the generated types, and a migration.
Payload resolves field names as strings, so a missed reference fails at runtime, not at
compile time. Hence Step 1.

**Files:**
- Modify: `src/collections/Products.ts`, `src/collections/Media.ts` (the `beforeDelete`
  hook queries `photo`), `src/app/(frontend)/page.tsx`,
  `src/app/(frontend)/products/[slug]/page.tsx`, `src/app/(frontend)/ProductImage.tsx`,
  `scripts/seed.ts`
- Create: `src/migrations/<generated>_rename_photo_to_image.ts`

**Interfaces:**
- Consumes: `<ProductImage media={…} className={…} />` from Task 7.
- Produces: `products.image` replaces `products.photo` everywhere.

- [ ] **Step 1: Find every reference before changing anything**

```bash
cd /c/Projects/TuringCollege/BwAI/overprint-shop
grep -rn "photo" src/ scripts/ tests/ --include="*.ts" --include="*.tsx" | grep -v payload-types
```

Expected: the field definition, the `beforeDelete` hook's `where: { photo: { equals: id } }`,
both page queries, the seed script, and any tests. Work from that list.

- [ ] **Step 2: Rename the field**

In `src/collections/Products.ts`, keeping every other property of the field as it is:

```ts
{ name: 'image', type: 'upload', relationTo: 'media', required: true },
```

- [ ] **Step 3: Update the delete guard**

In `src/collections/Media.ts`, the `beforeDelete` hook's query becomes
`where: { image: { equals: id } }`, and its `APIError` message says "image" rather than
"photo". This hook is what stops a media delete from violating `products.photo`'s NOT NULL
constraint — if the query silently matches nothing because the field was renamed underneath
it, the guard is gone and the failure is a raw database error on the owner's screen.

- [ ] **Step 4: Update both pages, `ProductImage`, and the seed**

Replace `product.photo` with `product.image` throughout, including the `media` prop passed
to `ProductImage` from Task 7 and the seed script's `photo: media.id`.

- [ ] **Step 5: Migrate — and read what was generated**

```bash
volta run --node 22 -- npx payload migrate:create rename_photo_to_image
```

**Open the generated `.ts` before running it.** A rename is frequently emitted as a column
drop plus a column add, which would discard every product's image. If that is what it says,
rewrite it as `ALTER TABLE products RENAME COLUMN photo_id TO image_id` (and rename the index
and foreign-key constraint to match), and say so in the report. Then:

```bash
volta run --node 22 -- npx payload migrate
volta run --node 22 -- npm run generate:types
```

- [ ] **Step 6: Confirm the data survived**

```bash
volta run --node 22 -- npx tsx -e "import 'dotenv/config'; import {getPayload} from 'payload'; import config from './src/payload.config.js'; const p = await getPayload({config}); const r = await p.find({collection:'products', depth:1, limit:50, overrideAccess:true}); console.log(r.docs.map(d => [d.slug, typeof d.image === 'object' ? d.image?.url : d.image]))"
```

Expected: every seeded product still has an image URL. An empty or null column here means
the migration dropped the data — restore from the pre-migration state rather than seeding
over it.

- [ ] **Step 7: Run everything**

```bash
volta run --node 22 -- npm test -- --no-file-parallelism
volta run --node 22 -- npx playwright test
volta run --node 22 -- npm run lint && volta run --node 22 -- npm run typecheck
```

- [ ] **Step 8: Retire the prose that asserts photography**

In `README.md` and `CLAUDE.md`, "mockup photo" becomes "product image". In `scripts/seed.ts`,
alt text of the form "Front view of the Midnight Tee, a solid black crew-neck t-shirt" drops
the claim of a camera: "The Midnight Tee, a solid black crew-neck t-shirt". Do the same for
the other two fixtures.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Rename photo to image; the old name asserted authenticity"
```

---

### Task 9: The legal page and footer

**Files:**
- Create: `src/app/(frontend)/legal/page.tsx`, `src/app/(frontend)/SiteFooter.tsx`
- Modify: `src/app/(frontend)/layout.tsx`, `src/app/(frontend)/DemoBanner.tsx`
- Test: `tests/e2e/legal.e2e.spec.ts`

- [ ] **Step 1: Write the legal page**

`src/app/(frontend)/legal/page.tsx`, with `export const metadata = { title: 'Legal & privacy' }`. Five sections, in this order, in plain language:

1. **What this is.** A non-commercial student demonstration built for a course. Nothing is for sale, no goods are shipped, all payments run in Stripe's test mode, no real money can change hands. State plainly: do not enter real card details or a real address.
2. **Who runs it.** `Overprint — a student project by Peter`, contact `overprintdemoshop@gmail.com` as a working `mailto:` link. No postal address.
3. **AI-generated images.** Every product image is generated by an AI image model, not photographed. They carry C2PA provenance metadata identifying the generator.
4. **Privacy.** What is collected (email, name, shipping address, order contents — and card details **by Stripe, never by us**); why; the lawful basis for each (contract for the order record, legitimate interests for fraud prevention); who processes it — **Vercel and Supabase as processors, Stripe as an independent controller for payment processing**; where it is stored (AWS eu-west-1, functions pinned to `dub1`); retention (unpaid orders 30 days, paid orders 2 years then redacted); and how to exercise access, rectification, erasure and portability — by emailing the contact address. State honestly that **we cannot erase data held by Stripe**, who must be contacted separately.
5. **Not legal advice.** This page is a student project's good-faith attempt, not a professionally drafted policy.

- [ ] **Step 2: Build the footer and mount it**

`SiteFooter.tsx` — a link to `/legal` and the shop name. Mount it in `src/app/(frontend)/layout.tsx` below `{children}`, so it appears on every storefront page and nowhere in `(payload)`.

- [ ] **Step 3: Extend the banner**

In `DemoBanner.tsx`, add the address clause to the existing wording: real card details **and** a real address should not be entered. Collecting an address in a shop that never ships is only honest if the notice says so.

- [ ] **Step 4: Write the end-to-end test**

```ts
test('every storefront page links to the legal page', async ({ page }) => {
  for (const path of ['/', '/products/midnight-tee', '/order/success']) {
    await page.goto(path)
    await expect(page.getByRole('link', { name: /legal/i })).toBeVisible()
  }
})

test('the legal page names the contact and the AI disclosure', async ({ page }) => {
  await page.goto('/legal')
  await expect(page.getByText('overprintdemoshop@gmail.com')).toBeVisible()
  await expect(page.getByText(/AI/i).first()).toBeVisible()
})

test('the admin panel has no storefront footer', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('link', { name: /legal/i })).toHaveCount(0)
})
```

- [ ] **Step 5: Run, then commit**

```bash
volta run --node 22 -- npx playwright test
git add -A && git commit -m "Publish a legal page, and link it from every storefront page"
```

---

# PHASE 4 — Data subject rights

### Task 10: Shared order lookup and redaction

**Files:**
- Create: `src/lib/order-admin.ts`
- Test: `tests/int/order-admin.int.spec.ts`

**Interfaces:**
- Produces: `findOrders({ email?, sessionId? }): Promise<Order[]>`, `redactOrder(id): Promise<Order>`, `assertSafeTarget(): void`.

- [ ] **Step 1: Write the failing tests**

```ts
it('redacts identity and keeps the transactional record', async () => {
  const before = await payload.findByID({ collection: 'orders', id, overrideAccess: true })
  await redactOrder(id)
  const after = await payload.findByID({ collection: 'orders', id, overrideAccess: true })
  expect(after.email).toBeFalsy()
  expect(after.shippingName).toBeFalsy()
  expect(after.shippingAddress?.line1).toBeFalsy()
  expect(after.amountTotal).toBe(before.amountTotal)
  expect(after.status).toBe(before.status)
  expect(after.items[0].sizeSnapshot).toBe(before.items[0].sizeSnapshot)
})

it('finds orders by email and by session id', async () => {
  expect((await findOrders({ email: FIXTURE_EMAIL }))[0].id).toBe(id)
  expect((await findOrders({ sessionId: FIXTURE_SESSION }))[0].id).toBe(id)
})
```

Erasure **redacts rather than deletes**: the amount and date are a commercial record with their own retention basis; the identity is not. A redacted order is no longer personal data in our system, which is what Art. 17 asks for.

- [ ] **Step 2: Implement**

`assertSafeTarget()` reuses the same guard shape as `scripts/seed.ts` — compare the `DATABASE_URI` project ref against `SEED_DEV_PROJECT_REF`, fail closed, and allow an explicit override for the deliberate production case. Import and reuse the existing `extractSupabaseProjectRef` rather than reimplementing it.

All writes use the Local API with `overrideAccess: true`, since every personal field is now `update: () => false`.

- [ ] **Step 3: Run, then commit**

```bash
volta run --node 22 -- npm test -- --no-file-parallelism
git add -A && git commit -m "Add shared order lookup and redaction"
```

---

### Task 11: The three scripts

**Files:**
- Create: `scripts/export-order.ts`, `scripts/erase-order.ts`, `scripts/prune-orders.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `findOrders`, `redactOrder`, `assertSafeTarget` from `src/lib/order-admin.ts`.

- [ ] **Step 1: Write the three scripts**

Each takes `--email` or `--session`, calls `assertSafeTarget()` first, and prints what it will do before doing it.

- **`export-order.ts`** — writes matching orders to JSON on stdout. Read-only. Satisfies Art. 15 and 20.
- **`erase-order.ts`** — redacts matching orders. **Requires an explicit `--confirm` flag**; without it, it prints what it would redact and exits 0 without writing.
- **`prune-orders.ts`** — deletes `pending`/`expired` orders older than 30 days, and redacts `paid` orders older than 2 years. Same `--confirm` requirement.

Add npm scripts: `export:order`, `erase:order`, `prune:orders`.

- [ ] **Step 2: Prove the guard and the dry-run**

Run each three ways and record the verbatim output:

1. no `--confirm` → prints the plan, writes nothing, exits 0
2. `NODE_ENV=production` → refuses, non-zero exit
3. `DATABASE_URI` pointed at an invented host → refuses, non-zero exit

A guard you have not seen refuse is not a guard.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add export, erasure and retention scripts"
```

---

### Task 12: Documentation and the pull request

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Update `README.md`**

Add: sizes; the shipping address and where it comes from; the fulfilment workflow; the legal page; the three scripts and their `--confirm` requirement; and the retention periods. Update the known-limitations list — `orders.email` is no longer stored-but-unread, since the fulfilment view reads it.

- [ ] **Step 2: Update `CLAUDE.md`**

Add two constraints:

- **Never add image resizing.** `imageSizes`, `resizeOptions` or `next/image` strip the C2PA provenance manifests that are the machine-readable evidence these images are AI-generated.
- **Orders: only `fulfilmentStatus` is admin-writable.** Every other field is `update: () => false` at field level. If you need to change one, ask why — the answer is usually that the webhook should be doing it.

- [ ] **Step 3: Open the pull request and STOP**

```bash
git push -u origin <branch>
gh pr create --base main --fill
```

**Do not merge.** Report the PR number and stop.

---

## Final verification

- [ ] `npm test -- --no-file-parallelism` passes
- [ ] `npx playwright test` passes
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] A size is required, validated, visible on the Stripe page, and stored on the order
- [ ] A German address is collected and stored from `collected_information.shipping_details`
- [ ] An admin can mark an order shipped and cannot change `status`, `paidAt` or `amountTotal`
- [ ] Product images carry a visible "AI-generated image" caption
- [ ] `/legal` is reachable from every storefront page and names the real contact
- [ ] All three scripts refuse without `--confirm` and against a non-development database
- [ ] The three seeded products and `dev@overprint.local` are untouched

## Owner actions this plan cannot perform

1. **Set a Terms of Service URL in Stripe** (Settings → Checkout and Payment Links). Task 4 Step 1 fails without it.
2. **Set the four production images to "AI-generated"** in the production admin panel, after Task 7 deploys.
3. **Merge every pull request.**

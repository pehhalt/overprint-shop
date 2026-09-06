/**
 * Task 10: the checkout handler.
 *
 * The property this handler exists to guarantee: the amount sent to Stripe is
 * read from the database inside the same request. Nothing in the request
 * body is trusted — a client-supplied price is a free-shirt button.
 *
 * Unlike the brief's own test sketch, this suite does NOT mock Payload. Only
 * Stripe's `checkout.sessions.create` and `checkout.sessions.expire` are
 * mocked (we don't want to hit the real Stripe API from a test run, and we
 * don't need to — nothing here depends on what Stripe does with the
 * session). The handler runs against
 * the real development database, the same way `tests/int/orders-access.int.spec.ts`
 * and `tests/int/media-delete-guard.int.spec.ts` do. Mocking the database
 * would make the single most important assertion in this file — that the
 * price handed to Stripe comes from the database, not the request — vacuous:
 * a mocked `findByID` could be made to return anything, including the
 * client-supplied price itself, and the test would still pass.
 *
 * Fixture products are created here (clearly named `Task10 Fixture …`) and
 * removed in `afterAll`, along with any orders they produced. The seeded
 * Midnight/Coral Sunset/Forest Ridge products and `dev@overprint.local` are
 * never touched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@payload-config'

const { sessionsCreate, sessionsExpire } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: sessionsCreate, expire: sessionsExpire } } },
}))

const { POST } = await import('@/app/(frontend)/shop/checkout/route')

const FIXTURE_ALT = 'Task10 Fixture: checkout image'
const FIXTURE_PRICE = 4321
const AVAILABLE_SLUG = 'task10-fixture-checkout-available'
const AVAILABLE_NAME = 'Task10 Fixture Product (checkout, available)'
const SOLD_OUT_SLUG = 'task10-fixture-checkout-sold-out'
const SOLD_OUT_NAME = 'Task10 Fixture Product (checkout, sold out)'

const SESSION_ID_PRICE_TEST = 'task10-fixture-cs_test_charges_db_price'
const SESSION_ID_ORDER_TEST = 'task10-fixture-cs_test_writes_pending_order'
const SESSION_ID_MANAGED_PAYMENTS_TEST = 'task10-fixture-cs_test_managed_payments_disabled'
const SESSION_ID_SIZE_TEST = 'task10-fixture-cs_test_size_in_line_item'
const SESSION_ID_SIZE_SNAPSHOT_TEST = 'task10-fixture-cs_test_size_snapshot'
const SESSION_ID_COLLECTION_TEST = 'task10-fixture-cs_test_address_collection'
const SESSION_ID_TERMS_TEST = 'task10-fixture-cs_test_terms_accepted_at'

function request(body: unknown) {
  return new Request('http://localhost:3000/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function makeImageBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .png()
    .toBuffer()
}

describe('POST /shop/checkout (Task 10)', () => {
  let payload: Payload
  let mediaId: number
  let availableProductId: number
  let soldOutProductId: number

  beforeAll(async () => {
    payload = await getPayload({ config })

    const buffer = await makeImageBuffer()
    const media = await payload.create({
      collection: 'media',
      data: { alt: FIXTURE_ALT, generatedBy: 'photograph' },
      file: {
        data: buffer,
        mimetype: 'image/png',
        name: 'task10-checkout-fixture.png',
        size: buffer.length,
      },
    })
    mediaId = media.id

    const available = await payload.create({
      collection: 'products',
      data: {
        name: AVAILABLE_NAME,
        slug: AVAILABLE_SLUG,
        price: FIXTURE_PRICE,
        description: 'Task 10 fixture: available for checkout.',
        image: mediaId,
        soldOut: false,
      },
    })
    availableProductId = available.id

    const soldOut = await payload.create({
      collection: 'products',
      data: {
        name: SOLD_OUT_NAME,
        slug: SOLD_OUT_SLUG,
        price: 999,
        description: 'Task 10 fixture: sold out, must refuse checkout.',
        image: mediaId,
        soldOut: true,
      },
    })
    soldOutProductId = soldOut.id
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000'
  })

  afterAll(async () => {
    // Clean up orders these tests may have created (matched by the fixture
    // session ids), then the fixture products, then the fixture media —
    // whatever the test outcome was.
    const remainingOrders = await payload.find({
      collection: 'orders',
      where: {
        stripeCheckoutSessionId: {
          in: [
            SESSION_ID_PRICE_TEST,
            SESSION_ID_ORDER_TEST,
            SESSION_ID_MANAGED_PAYMENTS_TEST,
            SESSION_ID_SIZE_TEST,
            SESSION_ID_SIZE_SNAPSHOT_TEST,
            SESSION_ID_COLLECTION_TEST,
            SESSION_ID_TERMS_TEST,
          ],
        },
      },
      limit: 10,
      overrideAccess: true,
    })
    for (const doc of remainingOrders.docs) {
      await payload
        .delete({ collection: 'orders', id: doc.id, overrideAccess: true })
        .catch(() => {})
    }

    const remainingProducts = await payload.find({
      collection: 'products',
      where: { slug: { in: [AVAILABLE_SLUG, SOLD_OUT_SLUG] } },
      limit: 10,
    })
    for (const doc of remainingProducts.docs) {
      await payload.delete({ collection: 'products', id: doc.id }).catch(() => {})
    }

    await payload.delete({ collection: 'media', id: mediaId }).catch(() => {})
  })

  it('charges the database price, not one supplied by the client', async () => {
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_PRICE_TEST,
      url: 'https://checkout.stripe.com/x',
    })

    // The request body lies about the price. The handler must ignore it.
    const response = await POST(
      request({ productId: String(availableProductId), size: 'M', price: 1, acceptedTerms: true }),
    )

    expect(response.status).toBe(200)
    expect(sessionsCreate).toHaveBeenCalledOnce()
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(FIXTURE_PRICE)
    expect(args.line_items[0].price_data.unit_amount).not.toBe(1)
  })

  it('writes a pending order carrying the checkout session id, with unitAmountSnapshot equal to the database price', async () => {
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_ORDER_TEST,
      url: 'https://checkout.stripe.com/y',
    })

    const response = await POST(
      request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }),
    )
    expect(response.status).toBe(200)

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: SESSION_ID_ORDER_TEST } },
      overrideAccess: true,
    })

    expect(found.totalDocs).toBe(1)
    const order = found.docs[0]
    expect(order.status).toBe('pending')
    expect(order.stripeCheckoutSessionId).toBe(SESSION_ID_ORDER_TEST)
    expect(order.amountTotal).toBe(FIXTURE_PRICE)
    expect(order.items[0].unitAmountSnapshot).toBe(FIXTURE_PRICE)
  })

  it('refuses a sold-out product with 409, creating no Stripe session and no order row', async () => {
    const beforeCount = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: soldOutProductId } },
      overrideAccess: true,
    })

    const response = await POST(
      request({ productId: String(soldOutProductId), size: 'M', acceptedTerms: true }),
    )
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toBeTruthy()
    expect(sessionsCreate).not.toHaveBeenCalled()

    const afterCount = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: soldOutProductId } },
      overrideAccess: true,
    })
    expect(afterCount.totalDocs).toBe(beforeCount.totalDocs)
  })

  it('disables Managed Payments on the created session (required for inline price_data on this sandbox account)', async () => {
    // Regression guard: this sandbox account has Managed Payments enabled by
    // default, which requires a tax code on every line item's product.
    // Inline `price_data` carries none, so Stripe rejects the session with
    // "the product tax code is missing" unless `managed_payments.enabled` is
    // explicitly set to `false`. Stripe is mocked here, so this can't catch
    // the 502 itself — it only proves the flag is still being sent, so
    // nobody removes it later as apparent dead code.
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_MANAGED_PAYMENTS_TEST,
      url: 'https://checkout.stripe.com/managed-payments',
    })

    await POST(request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }))

    expect(sessionsCreate).toHaveBeenCalledOnce()
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.managed_payments).toEqual({ enabled: false })
  })

  it('rejects a request with no productId with 400', async () => {
    const response = await POST(request({}))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBeTruthy()
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('rejects a request with no size', async () => {
    const response = await POST(
      request({ productId: String(availableProductId), acceptedTerms: true }),
    )
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
      const response = await POST(
        request({ productId: String(availableProductId), size: bad, acceptedTerms: true }),
      )
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

    await POST(request({ productId: String(availableProductId), size: 'L', acceptedTerms: true }))

    const args = sessionsCreate.mock.calls[0][0]
    expect(args.line_items[0].price_data.product_data.name).toBe(`${AVAILABLE_NAME} — L`)
  })

  it('snapshots the chosen size on the order line', async () => {
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_SIZE_SNAPSHOT_TEST,
      url: 'https://checkout.stripe.com/snapshot',
    })

    await POST(request({ productId: String(availableProductId), size: 'XL', acceptedTerms: true }))

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: SESSION_ID_SIZE_SNAPSHOT_TEST } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(1)
    expect(found.docs[0].items[0].sizeSnapshot).toBe('XL')
  })

  it('returns 502 with a JSON error body when Stripe fails, and writes no order', async () => {
    sessionsCreate.mockRejectedValue(new Error('Stripe is down (simulated)'))

    const beforeCount = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: availableProductId } },
      overrideAccess: true,
    })

    const response = await POST(
      request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }),
    )
    // A non-JSON 500 is exactly the bug this test guards against — the
    // response must always be parseable JSON, whatever the status.
    const data = await response.json()

    expect(response.status).toBe(502)
    expect(data.error).toBeTruthy()
    expect(data.url).toBeUndefined()

    const afterCount = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: availableProductId } },
      overrideAccess: true,
    })
    expect(afterCount.totalDocs).toBe(beforeCount.totalDocs)
  })

  it('expires the Stripe session and returns an error when the order write fails afterwards', async () => {
    const SESSION_ID_EXPIRE_TEST = 'task10-fixture-cs_test_order_write_fails'
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_EXPIRE_TEST,
      url: 'https://checkout.stripe.com/z',
    })
    sessionsExpire.mockResolvedValue({ id: SESSION_ID_EXPIRE_TEST, status: 'expired' })

    const createSpy = vi
      .spyOn(payload, 'create')
      .mockRejectedValueOnce(new Error('DB write failed (simulated)'))

    try {
      const response = await POST(
        request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }),
      )
      const data = await response.json()

      expect(response.status).toBe(502)
      expect(data.error).toBeTruthy()
      expect(data.url).toBeUndefined()

      // The compensating action: the now-orphaned session must be closed so
      // it can never be paid.
      expect(sessionsExpire).toHaveBeenCalledOnce()
      expect(sessionsExpire).toHaveBeenCalledWith(SESSION_ID_EXPIRE_TEST)

      const found = await payload.find({
        collection: 'orders',
        where: { stripeCheckoutSessionId: { equals: SESSION_ID_EXPIRE_TEST } },
        overrideAccess: true,
      })
      expect(found.totalDocs).toBe(0)
    } finally {
      createSpy.mockRestore()
    }
  })

  it('collects a German shipping address and card only, and asks Stripe for no consent', async () => {
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_COLLECTION_TEST,
      url: 'https://checkout.stripe.com/collect',
    })

    await POST(request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }))

    const args = sessionsCreate.mock.calls[0][0]
    expect(args.shipping_address_collection).toEqual({ allowed_countries: ['DE'] })
    expect(args.payment_method_types).toEqual(['card'])
    // Stripe's consent_collection needs a dashboard ToS URL this account cannot set
    // without activating, which CLAUDE.md forbids. Sending it 400s the whole session.
    // Consent is collected on our own page instead. Do not "restore" this.
    expect(args.consent_collection).toBeUndefined()
  })

  it('refuses checkout when the terms were not accepted, creating no session and no order', async () => {
    const before = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: availableProductId } },
      overrideAccess: true,
    })

    for (const bad of [undefined, false, 'true', 1, null, 'yes']) {
      const response = await POST(
        request({ productId: String(availableProductId), size: 'M', acceptedTerms: bad }),
      )
      expect(response.status, `acceptedTerms ${JSON.stringify(bad)} should be refused`).toBe(400)
    }
    expect(sessionsCreate).not.toHaveBeenCalled()

    const after = await payload.find({
      collection: 'orders',
      where: { 'items.product': { equals: availableProductId } },
      overrideAccess: true,
    })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('records when the terms were accepted', async () => {
    sessionsCreate.mockResolvedValue({
      id: SESSION_ID_TERMS_TEST,
      url: 'https://checkout.stripe.com/terms',
    })

    const before = Date.now()
    await POST(request({ productId: String(availableProductId), size: 'M', acceptedTerms: true }))

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: SESSION_ID_TERMS_TEST } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(1)
    const acceptedAt = new Date(found.docs[0].termsAcceptedAt!).getTime()
    expect(acceptedAt).toBeGreaterThanOrEqual(before - 1000)
    expect(acceptedAt).toBeLessThanOrEqual(Date.now() + 1000)
  })
})

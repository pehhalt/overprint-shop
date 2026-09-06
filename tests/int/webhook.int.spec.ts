/**
 * Task 11: the Stripe webhook handler.
 *
 * The property this handler exists to guarantee — the one line in the course
 * brief this whole project is built around — is:
 *
 *   "Only record the order as paid when that confirmation arrives from
 *    Stripe and is verified as genuine, never just because the customer
 *    reached the thank-you page."
 *
 * This handler is the only thing in the system permitted to decide that
 * money arrived. Nothing here is mocked except the passage of time: we use
 * the REAL Stripe SDK to both sign fixtures (`Stripe.webhooks.generateTestHeaderString`)
 * and verify them (`stripe.webhooks.constructEvent`, unmocked, inside the
 * handler), and we run against the REAL development database via Payload's
 * Local API, the same way `tests/int/checkout.int.spec.ts` and
 * `tests/int/orders-access.int.spec.ts` do. A mocked verifier would pass
 * whether or not the handler checks anything, which would make this entire
 * task's tests worthless — the one thing that must never be faked here is
 * the signature check itself.
 *
 * `STRIPE_WEBHOOK_SECRET` is empty in `.env` (the real endpoint secret is
 * created in a later task, once there is a deployed URL to register with
 * Stripe), so this file sets its own known secret before importing the
 * route — the handler must use whatever `process.env.STRIPE_WEBHOOK_SECRET`
 * says at request time, not a value baked in anywhere.
 *
 * Fixture orders are created here (clearly named session ids prefixed
 * `cs_test_task11_`) and removed in `afterAll`, along with any order an
 * errant write might have created. The seeded Midnight/Coral Sunset/Forest
 * Ridge products and `dev@overprint.local` are never touched.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import Stripe from 'stripe'

const SECRET = 'whsec_task11_test_secret'
const WRONG_SECRET = 'whsec_task11_wrong_secret'

// Must be set before the route (and the `@/lib/stripe` module it imports)
// loads — `src/lib/stripe.ts` throws at import time if `STRIPE_SECRET_KEY`
// is missing. The real value from `.env` (loaded by `vitest.setup.ts`) is
// fine here since no network call is made; a dummy would do too.
process.env.STRIPE_SECRET_KEY ||= 'sk_test_task11_dummy'
process.env.STRIPE_WEBHOOK_SECRET = SECRET

const { POST } = await import('@/app/(frontend)/shop/stripe-webhook/route')

const SESSION_MISSING_SIG = 'cs_test_task11_missing_signature'
const SESSION_WRONG_SECRET = 'cs_test_task11_wrong_secret'
const SESSION_PAID = 'cs_test_task11_paid_and_replayed'
const SESSION_UNPAID = 'cs_test_task11_unpaid'
const SESSION_UNRELATED = 'cs_test_task11_unrelated_event'
const SESSION_EXPIRING = 'cs_test_task11_expiring'
const SESSION_ORPHAN = 'cs_test_task11_no_matching_order'
const SESSION_SHIPPING = 'cs_test_task11_shipping_collected_information'
const SESSION_SHIPPING_LEGACY = 'cs_test_task11_shipping_legacy_shape'

const ALL_FIXTURE_SESSION_IDS = [
  SESSION_MISSING_SIG,
  SESSION_WRONG_SECRET,
  SESSION_PAID,
  SESSION_UNPAID,
  SESSION_UNRELATED,
  SESSION_EXPIRING,
  SESSION_SHIPPING,
  SESSION_SHIPPING_LEGACY,
  // SESSION_ORPHAN deliberately excluded — no order is ever created for it,
  // and it must stay that way.
]

function completedEvent(sessionId: string, paymentStatus: string) {
  return {
    id: `evt_task11_${sessionId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        payment_status: paymentStatus,
        payment_intent: `pi_task11_${sessionId}`,
        customer_details: { email: 'buyer@example.com' },
      },
    },
  }
}

function expiredEvent(sessionId: string) {
  return {
    id: `evt_task11_expired_${sessionId}`,
    type: 'checkout.session.expired',
    data: { object: { id: sessionId } },
  }
}

function unrelatedEvent() {
  return {
    id: 'evt_task11_unrelated',
    type: 'payment_intent.created',
    data: { object: {} },
  }
}

function signedRequest(event: unknown, secret = SECRET, withSignature = true) {
  const body = JSON.stringify(event)
  const headers: Record<string, string> = {}
  if (withSignature) {
    headers['stripe-signature'] = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret,
    })
  }
  return new Request('http://localhost:3000/shop/stripe-webhook', {
    method: 'POST',
    headers,
    body,
  })
}

function fixtureOrderData(sessionId: string) {
  return {
    stripeCheckoutSessionId: sessionId,
    // `status` has a `defaultValue` on the collection but the generated
    // create-data type still requires it explicitly (Task 9's quirk).
    status: 'pending' as const,
    fulfilmentStatus: 'unfulfilled' as const,
    amountTotal: 4200,
    items: [
      {
        nameSnapshot: 'Task11 Fixture Shirt',
        unitAmountSnapshot: 4200,
        sizeSnapshot: 'M',
        quantity: 1,
      },
    ],
  }
}

async function findOrderBySessionId(payload: Payload, sessionId: string) {
  const { docs } = await payload.find({
    collection: 'orders',
    where: { stripeCheckoutSessionId: { equals: sessionId } },
    overrideAccess: true,
  })
  return docs[0] ?? null
}

describe('POST /shop/stripe-webhook (Task 11)', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })

    for (const sessionId of ALL_FIXTURE_SESSION_IDS) {
      await payload.create({
        collection: 'orders',
        overrideAccess: true,
        data: fixtureOrderData(sessionId),
      })
    }
  })

  afterAll(async () => {
    const remaining = await payload.find({
      collection: 'orders',
      where: {
        or: [
          { stripeCheckoutSessionId: { in: ALL_FIXTURE_SESSION_IDS } },
          { stripeCheckoutSessionId: { equals: SESSION_ORPHAN } },
        ],
      },
      limit: 20,
      overrideAccess: true,
    })
    for (const doc of remaining.docs) {
      await payload.delete({ collection: 'orders', id: doc.id, overrideAccess: true }).catch(() => {})
    }
  })

  it('1. rejects a request with no signature header, writing nothing', async () => {
    const before = await findOrderBySessionId(payload, SESSION_MISSING_SIG)

    const response = await POST(
      signedRequest(completedEvent(SESSION_MISSING_SIG, 'paid'), SECRET, false),
    )

    expect(response.status).toBe(400)

    const after = await findOrderBySessionId(payload, SESSION_MISSING_SIG)
    expect(after?.status).toBe(before?.status)
    expect(after?.status).toBe('pending')
  })

  it('2. rejects a signature made with the wrong secret, writing nothing', async () => {
    const response = await POST(
      signedRequest(completedEvent(SESSION_WRONG_SECRET, 'paid'), WRONG_SECRET),
    )

    expect(response.status).toBe(400)

    const after = await findOrderBySessionId(payload, SESSION_WRONG_SECRET)
    expect(after?.status).toBe('pending')
  })

  it('2b. logs no customer data when a signature fails, only the message', async () => {
    // Stripe's StripeSignatureVerificationError carries the raw request body on
    // `error.payload`, and console.error prints an error's own properties — so
    // logging the object put the customer's email and shipping address into the
    // platform log on every failed delivery. Platform logs are outside the reach
    // of erase:order, so that data would survive an erasure request.
    const event = completedEvent(SESSION_WRONG_SECRET, 'paid')
    const session = event.data.object as Record<string, unknown>
    session.customer_details = { email: 'leak-canary@example.com' }
    session.collected_information = {
      shipping_details: {
        name: 'Leak Canary',
        address: { line1: 'Canary Street 1', city: 'Berlin', postal_code: '10115', country: 'DE' },
      },
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await POST(signedRequest(event, WRONG_SECRET))
      expect(response.status).toBe(400)

      expect(errorSpy).toHaveBeenCalled()
      // Serialise everything handed to console.error the way a log collector
      // would, then assert none of the personal data survived into it.
      const logged = errorSpy.mock.calls.flat().map((arg) => {
        if (arg instanceof Error) return `${arg.message} ${JSON.stringify(arg, Object.getOwnPropertyNames(arg))}`
        return typeof arg === 'string' ? arg : JSON.stringify(arg)
      }).join(' ')

      expect(logged).not.toContain('leak-canary@example.com')
      expect(logged).not.toContain('Leak Canary')
      expect(logged).not.toContain('Canary Street 1')
      expect(logged).not.toContain('10115')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('3. marks the order paid on a verified completed session, setting paidAt and stripePaymentIntentId', async () => {
    const response = await POST(signedRequest(completedEvent(SESSION_PAID, 'paid')))

    expect(response.status).toBe(200)

    const order = await findOrderBySessionId(payload, SESSION_PAID)
    expect(order?.status).toBe('paid')
    expect(order?.paidAt).toBeTruthy()
    expect(order?.stripePaymentIntentId).toBe(`pi_task11_${SESSION_PAID}`)
  })

  it('4. is idempotent when the same event is replayed: still exactly one paid order, paidAt unchanged', async () => {
    const before = await findOrderBySessionId(payload, SESSION_PAID)
    expect(before?.status).toBe('paid')
    const paidAtBefore = before?.paidAt

    const response = await POST(signedRequest(completedEvent(SESSION_PAID, 'paid')))
    expect(response.status).toBe(200)

    const matching = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: SESSION_PAID } },
      overrideAccess: true,
    })
    expect(matching.totalDocs).toBe(1)

    const after = matching.docs[0]
    expect(after.status).toBe('paid')
    expect(after.paidAt).toBe(paidAtBefore)
  })

  it('5. does not mark paid when payment_status is unpaid; order stays pending', async () => {
    const response = await POST(signedRequest(completedEvent(SESSION_UNPAID, 'unpaid')))

    expect(response.status).toBe(200)

    const order = await findOrderBySessionId(payload, SESSION_UNPAID)
    expect(order?.status).toBe('pending')
  })

  it('6. ignores an unrelated event type, leaving the order unchanged', async () => {
    const before = await findOrderBySessionId(payload, SESSION_UNRELATED)

    const response = await POST(signedRequest(unrelatedEvent()))

    expect(response.status).toBe(200)

    const after = await findOrderBySessionId(payload, SESSION_UNRELATED)
    expect(after?.status).toBe(before?.status)
    expect(after?.status).toBe('pending')
  })

  it('7. marks a pending order expired on checkout.session.expired', async () => {
    const response = await POST(signedRequest(expiredEvent(SESSION_EXPIRING)))

    expect(response.status).toBe(200)

    const order = await findOrderBySessionId(payload, SESSION_EXPIRING)
    expect(order?.status).toBe('expired')
  })

  it('8. returns 200 and writes nothing for an event whose session id matches no order (logging the orphan)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await POST(signedRequest(completedEvent(SESSION_ORPHAN, 'paid')))

      expect(response.status).toBe(200)

      const order = await findOrderBySessionId(payload, SESSION_ORPHAN)
      expect(order).toBeNull()

      // No order was created for the orphaned session, and the human-facing
      // investigation trail exists.
      expect(errorSpy).toHaveBeenCalled()
      const loggedOrphan = errorSpy.mock.calls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === 'object' &&
            arg !== null &&
            'sessionId' in (arg as Record<string, unknown>) &&
            (arg as Record<string, unknown>).sessionId === SESSION_ORPHAN,
        ),
      )
      expect(loggedOrphan).toBe(true)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('9. stores the shipping address from collected_information', async () => {
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

  it('10. ignores a top-level shipping_details, which is the pre-Basil shape', async () => {
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
})

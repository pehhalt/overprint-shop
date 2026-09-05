/**
 * Task 12: the `/order/success` confirmation page.
 *
 * This page has no authority — it reads whatever `orders.status` already
 * says and renders it. It must never claim an order is paid on its own; that
 * decision belongs solely to the signature-verified Stripe webhook (Task 11).
 *
 * Testing a Next.js server component end-to-end (through a running `next
 * dev` server) is out of scope for an integration suite that otherwise talks
 * to Payload's Local API directly, so this file exercises the real page
 * component two ways:
 *
 *   1. `findOrderBySessionId` (`src/lib/orders.ts`), the data-loading path
 *      the page calls — against the real database, no mocks.
 *   2. The page component itself (`SuccessPage`), invoked directly as the
 *      async function it is and rendered to static HTML with
 *      `react-dom/server`, so the actual JSX/copy the customer would see is
 *      asserted on, not just the data it was built from.
 *
 * Not covered: real HTTP routing/query-string parsing (Next's own
 * `searchParams` plumbing), and browser behavior (refreshing to pick up a
 * webhook that lands after the page first rendered). Those are checked
 * manually with `curl` against `next dev` (see the Task 12 report).
 *
 * Fixture orders use sessions prefixed `cs_test_task12_`, are created in
 * `beforeAll` and removed in `afterAll`. The seeded Midnight/Coral
 * Sunset/Forest Ridge products and `dev@overprint.local` are never touched,
 * and no product fixture is created — order items reference no `product` at
 * all, the same pattern Tasks 9 and 11 use, which is itself proof that the
 * page cannot possibly be rendering from a live product relationship: there
 * isn't one to follow.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { renderToStaticMarkup } from 'react-dom/server'
import { findOrderBySessionId } from '@/lib/orders'
import SuccessPage from '@/app/(frontend)/order/success/page'

const SESSION_PAID = 'cs_test_task12_paid'
const SESSION_PENDING = 'cs_test_task12_pending'
const SESSION_EXPIRED = 'cs_test_task12_expired'
const SESSION_UNKNOWN = 'cs_test_task12_no_such_order'

const ALL_FIXTURE_SESSION_IDS = [SESSION_PAID, SESSION_PENDING, SESSION_EXPIRED]

// Deliberately distinct from every seeded product's name/price, so a test
// failure here can only mean the page rendered the snapshot (correct) or
// somehow rendered something else entirely — never that it coincidentally
// matched a live product.
const SNAPSHOT_NAME = 'Task12 Fixture Snapshot Shirt'
const SNAPSHOT_UNIT_AMOUNT = 3399 // EUR 33.99, an odd figure unlikely to collide with anything

function fixtureOrderData(sessionId: string, status: 'pending' | 'paid' | 'expired') {
  return {
    stripeCheckoutSessionId: sessionId,
    status,
    email: 'buyer@example.com',
    amountTotal: SNAPSHOT_UNIT_AMOUNT * 2,
    paidAt: status === 'paid' ? new Date().toISOString() : null,
    items: [
      {
        nameSnapshot: SNAPSHOT_NAME,
        unitAmountSnapshot: SNAPSHOT_UNIT_AMOUNT,
        quantity: 2,
      },
    ],
  }
}

async function renderSuccessPage(sessionId?: string): Promise<string> {
  const element = await SuccessPage({
    searchParams: Promise.resolve(sessionId ? { session_id: sessionId } : {}),
  })
  return renderToStaticMarkup(element)
}

describe('/order/success (Task 12)', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config })

    await payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: fixtureOrderData(SESSION_PAID, 'paid'),
    })
    await payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: fixtureOrderData(SESSION_PENDING, 'pending'),
    })
    await payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: fixtureOrderData(SESSION_EXPIRED, 'expired'),
    })
  })

  afterAll(async () => {
    const remaining = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { in: ALL_FIXTURE_SESSION_IDS } },
      limit: 20,
      overrideAccess: true,
    })
    for (const doc of remaining.docs) {
      await payload.delete({ collection: 'orders', id: doc.id, overrideAccess: true }).catch(() => {})
    }
  })

  describe('data-loading path (findOrderBySessionId)', () => {
    it('finds a paid order by its Checkout Session id', async () => {
      const order = await findOrderBySessionId(payload, SESSION_PAID)
      expect(order?.status).toBe('paid')
      expect(order?.items?.[0]?.nameSnapshot).toBe(SNAPSHOT_NAME)
      expect(order?.items?.[0]?.unitAmountSnapshot).toBe(SNAPSHOT_UNIT_AMOUNT)
    })

    it('finds a pending order and reports it as pending, not paid', async () => {
      const order = await findOrderBySessionId(payload, SESSION_PENDING)
      expect(order?.status).toBe('pending')
    })

    it('returns null for a session id with no matching order', async () => {
      const order = await findOrderBySessionId(payload, SESSION_UNKNOWN)
      expect(order).toBeNull()
    })
  })

  describe('rendered page', () => {
    it('renders a paid order as paid, showing the SNAPSHOT name and price, and the correct total', async () => {
      const html = await renderSuccessPage(SESSION_PAID)

      expect(html).toContain('paid')
      expect(html.toLowerCase()).toContain('thank you')
      expect(html).toContain(SNAPSHOT_NAME)
      // formatPrice(3399) -> "€33.99" in en-IE; assert on the digits, which
      // is what actually proves the snapshot (not some other number) made it
      // onto the page.
      expect(html).toContain('33.99')
      expect(html).toContain('67.98') // amountTotal = 3399 * 2

      // Must never claim payment is still pending on a paid order.
      expect(html.toLowerCase()).not.toContain('confirming')
    })

    it('does NOT claim success for a pending order, and still shows what was charged', async () => {
      const html = await renderSuccessPage(SESSION_PENDING)

      expect(html.toLowerCase()).not.toContain('thank you')
      expect(html.toLowerCase()).not.toContain('your order is paid')
      expect(html.toLowerCase()).toContain('confirming')
      // Still shows the line items — the customer should see what they're
      // about to have confirmed, not a blank page.
      expect(html).toContain(SNAPSHOT_NAME)
    })

    it('renders an expired checkout as expired, not as paid or pending-confirmation', async () => {
      const html = await renderSuccessPage(SESSION_EXPIRED)

      expect(html.toLowerCase()).toContain('expired')
      expect(html.toLowerCase()).not.toContain('thank you')
      expect(html.toLowerCase()).not.toContain('confirming your payment')
    })

    it('renders the not-found state for an unknown session id, without throwing', async () => {
      const html = await renderSuccessPage(SESSION_UNKNOWN)

      expect(html.toLowerCase()).toContain('could not find')
      expect(html).toContain('/">')
    })

    it('renders the no-session state when session_id is missing entirely, without throwing', async () => {
      const html = await renderSuccessPage(undefined)

      expect(html.toLowerCase()).toContain('no order to show')
    })

    it('never displays the customer email address', async () => {
      const html = await renderSuccessPage(SESSION_PAID)
      expect(html).not.toContain('buyer@example.com')
    })
  })
})

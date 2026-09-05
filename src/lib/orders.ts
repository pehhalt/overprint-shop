import type { Payload } from 'payload'
import type { Order } from '../payload-types'

/**
 * Looks up the order that a Stripe Checkout Session id belongs to.
 *
 * This is a pure read. It never writes, never calls Stripe, and never marks
 * anything paid — `order.status` is whatever the signature-verified webhook
 * (Task 11) last recorded. Extracted from the `/order/success` page so the
 * data-loading path can be exercised directly in `tests/int`, since a Next.js
 * server component can't easily be rendered and asserted on in a unit test.
 *
 * `orders` read access is admin-only (`isLoggedIn`), and the customer
 * arriving on the success page is never logged in, so this always calls the
 * Local API with `overrideAccess: true`.
 */
export async function findOrderBySessionId(
  payload: Payload,
  sessionId: string,
): Promise<Order | null> {
  const { docs } = await payload.find({
    collection: 'orders',
    where: { stripeCheckoutSessionId: { equals: sessionId } },
    limit: 1,
    overrideAccess: true,
  })

  return docs[0] ?? null
}

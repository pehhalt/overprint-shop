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

/**
 * How long the `/order/success` confirmation page will disclose an order's
 * contents after it was created.
 *
 * This page has no authentication of its own — holding the `session_id` is
 * the only thing that "authorizes" a viewer. Without an expiry, any order
 * ever created renders forever, so a session id that leaks once (browser
 * history, a screenshot, a referrer header, a support email) stays a live
 * exposure indefinitely. 30 minutes is generous enough to absorb a slow
 * Stripe webhook and a customer refreshing the page, while being short
 * enough that a link which leaks later is normally already dead.
 */
export const ORDER_CONFIRMATION_WINDOW_MS = 30 * 60 * 1000

/**
 * Whether `/order/success` should refuse to disclose this order's contents
 * because it is older than {@link ORDER_CONFIRMATION_WINDOW_MS}.
 *
 * `now` is injectable so tests don't have to wait 30 real minutes to prove
 * the expiry works — see `tests/int/order-success.int.spec.ts`.
 */
export function isOrderConfirmationExpired(
  order: Pick<Order, 'createdAt'>,
  now: Date = new Date(),
): boolean {
  const createdAt = new Date(order.createdAt).getTime()
  return now.getTime() - createdAt > ORDER_CONFIRMATION_WINDOW_MS
}

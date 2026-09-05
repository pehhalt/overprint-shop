import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

// Payload owns /api/[...slug]; our shop-specific handlers live outside it.
export const runtime = 'nodejs'

const ok = () => NextResponse.json({ received: true })

// This handler is the only thing in the system permitted to decide that money
// arrived. An order is marked paid because Stripe's own signed webhook says
// so — never because a browser reached the thank-you page. Every write below
// goes through the Local API with `overrideAccess: true`, the deliberate
// exception Task 9 closed `orders` create/update/delete off from every other
// caller for.
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // The raw body, unparsed — signature verification is over the exact bytes
  // Stripe signed. Parsing first and re-serialising would break it.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    )
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired') {
    // Return 2xx for everything we deliberately ignore — a non-2xx makes
    // Stripe retry an event we have already decided not to act on.
    return ok()
  }

  const session = event.data.object as Stripe.Checkout.Session
  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'orders',
    where: { stripeCheckoutSessionId: { equals: session.id } },
    limit: 1,
    overrideAccess: true,
  })

  const order = docs[0]
  if (!order) {
    // No order matches this session id. This is the orphaned-payment case a
    // human needs to investigate — log it clearly, but still 200: nothing
    // about retrying this event would change the outcome.
    console.error('Stripe webhook: no order found for checkout session', {
      eventId: event.id,
      eventType: event.type,
      sessionId: session.id,
    })
    return ok()
  }

  if (event.type === 'checkout.session.expired') {
    // Only expire an order that is still pending — never overwrite a paid
    // (or already-expired) order.
    if (order.status === 'pending') {
      await payload.update({
        collection: 'orders',
        id: order.id,
        overrideAccess: true,
        data: { status: 'expired' },
      })
    }
    return ok()
  }

  // event.type === 'checkout.session.completed'
  if (session.payment_status !== 'paid') return ok()
  if (order.status === 'paid') return ok() // Stripe retries; this must be idempotent.

  await payload.update({
    collection: 'orders',
    id: order.id,
    overrideAccess: true,
    data: {
      status: 'paid',
      paidAt: new Date().toISOString(),
      stripePaymentIntentId:
        typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      email: session.customer_details?.email ?? undefined,
    },
  })

  return ok()
}

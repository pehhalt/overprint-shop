import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { stripe } from '@/lib/stripe'
import { CURRENCY } from '@/lib/constants'

// Payload owns /api/[...slug]; our shop-specific handlers live outside it.
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { productId?: unknown } | null
  const productId = body?.productId

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  // The price comes from the database, read fresh inside this request. Nothing
  // in the request body is trusted — a client-supplied price is a free-shirt
  // button.
  const product = await payload
    .findByID({ collection: 'products', id: productId, depth: 0 })
    .catch(() => null)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  if (product.soldOut) {
    return NextResponse.json({ error: 'This design is sold out' }, { status: 409 })
  }

  const origin = process.env.NEXT_PUBLIC_SERVER_URL

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // This sandbox account has Managed Payments enabled by default, which
      // requires every line item's product to carry a Stripe tax code.
      // Inline `price_data` (see the comment below on why we use it instead
      // of pre-created Stripe Products) has no tax code, so Stripe rejects
      // the session with "the product tax code is missing" unless Managed
      // Payments is explicitly turned off for this session. Do not remove
      // this — without it, checkout 502s against a live Stripe account
      // (confirmed against Stripe's API directly), a failure mode no test
      // here can catch because Stripe itself is mocked.
      managed_payments: { enabled: false },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: product.price,
            product_data: { name: product.name },
          },
        },
      ],
      success_url: `${origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/products/${product.slug}`,
    })
  } catch (error) {
    // Stripe is an upstream dependency failing, not a client mistake — 502,
    // not 400/500. Log the real error server-side; never hand its text to
    // the client.
    console.error('Stripe checkout session creation failed', error)
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again in a moment.' },
      { status: 502 },
    )
  }

  // Written pending now; only the signature-verified Stripe webhook may mark
  // an order paid. `overrideAccess: true` is required here — Task 9 closed
  // `create` to every HTTP path deliberately, and this handler is the
  // server-side exception that path is meant for.
  try {
    await payload.create({
      collection: 'orders',
      overrideAccess: true,
      data: {
        stripeCheckoutSessionId: session.id,
        status: 'pending',
        amountTotal: product.price,
        items: [
          {
            product: product.id,
            nameSnapshot: product.name,
            unitAmountSnapshot: product.price,
            quantity: 1,
          },
        ],
      },
    })
  } catch (error) {
    // The session already exists at Stripe but has no order to be marked
    // paid against — a customer could pay into the void. Close the window by
    // expiring the session so it can no longer be paid, rather than leaving
    // it live and racing a fix on the order side.
    console.error('Order write failed after Stripe session creation; expiring session', {
      sessionId: session.id,
      error,
    })
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch (expireError) {
      // This is the case a human needs to see: a live, payable session with
      // no order behind it, and we could not even close it ourselves.
      console.error('FAILED TO EXPIRE ORPHANED STRIPE SESSION — manual intervention required', {
        sessionId: session.id,
        expireError,
      })
    }
    return NextResponse.json(
      { error: 'Could not start checkout. Please try again in a moment.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ url: session.url })
}

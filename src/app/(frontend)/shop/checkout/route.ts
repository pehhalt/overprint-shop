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

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
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

  // Written pending now; only the signature-verified Stripe webhook may mark
  // an order paid. `overrideAccess: true` is required here — Task 9 closed
  // `create` to every HTTP path deliberately, and this handler is the
  // server-side exception that path is meant for.
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

  return NextResponse.json({ url: session.url })
}

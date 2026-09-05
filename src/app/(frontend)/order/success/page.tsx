import { getPayload } from 'payload'
import configPromise from '@payload-config'
import Link from 'next/link'
import { formatPrice } from '@/lib/constants'
import { findOrderBySessionId } from '@/lib/orders'

// Without this the page could be served from cache and show a stale order
// state (e.g. "confirming" long after the webhook actually landed).
export const dynamic = 'force-dynamic'

function NoOrder({ heading }: { heading: string }) {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{heading}</h1>
      <Link href="/" className="mt-4 inline-block underline">
        Back to the shop
      </Link>
    </main>
  )
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id: sessionId } = await searchParams

  if (!sessionId) {
    return <NoOrder heading="No order to show" />
  }

  const payload = await getPayload({ config: configPromise })
  const order = await findOrderBySessionId(payload, sessionId)

  if (!order) {
    return <NoOrder heading="We could not find that order" />
  }

  // This page only reports what the database already says. It never decides
  // that an order is paid — only the signature-verified Stripe webhook
  // (Task 11) does that. `order.status` is read straight from the record it
  // wrote.
  if (order.status === 'expired') {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">This checkout expired</h1>
        <p className="mt-2 text-neutral-600">
          The payment session timed out before it was completed. No charge was made — please
          start again from the shop.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Back to the shop
        </Link>
      </main>
    )
  }

  const isPaid = order.status === 'paid'

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">
        {isPaid ? 'Thank you — your order is paid' : 'Confirming your payment…'}
      </h1>

      {!isPaid && (
        <p className="mt-2 text-neutral-600">
          Stripe is confirming this payment with us. This usually takes a few seconds — refresh
          this page in a moment.
        </p>
      )}

      <ul className="mt-6 divide-y rounded-lg border">
        {order.items?.map((item, index) => (
          <li key={index} className="flex justify-between p-4">
            <span>
              {item.nameSnapshot} × {item.quantity}
            </span>
            <span>{formatPrice(item.unitAmountSnapshot)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex justify-between font-medium">
        <span>Total</span>
        <span>{formatPrice(order.amountTotal)}</span>
      </p>

      <Link href="/" className="mt-8 inline-block underline">
        Back to the shop
      </Link>
    </main>
  )
}

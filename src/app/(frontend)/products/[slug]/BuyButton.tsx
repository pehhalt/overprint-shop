'use client'

import { useState } from 'react'

export function BuyButton({ productId, soldOut }: { productId: string; soldOut: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (soldOut) {
    return <p className="mt-6 rounded border px-4 py-2 text-center font-medium">Sold out</p>
  }

  async function buy() {
    setBusy(true)
    setError(null)

    const response = await fetch('/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    })

    const data = await response.json()

    if (!response.ok) {
      setError(data.error ?? 'Could not start checkout')
      setBusy(false)
      return
    }

    window.location.href = data.url
  }

  return (
    <div className="mt-6">
      <button
        onClick={buy}
        disabled={busy}
        className="w-full rounded bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Taking you to checkout…' : 'Buy this shirt'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}

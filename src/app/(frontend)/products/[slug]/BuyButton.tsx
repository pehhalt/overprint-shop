'use client'

import { useState } from 'react'
import { SIZES, SIZE_DEFAULT, type Size } from '@/lib/constants'

export function BuyButton({ productId, soldOut }: { productId: string; soldOut: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<Size>(SIZE_DEFAULT)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  if (soldOut) {
    return <p className="mt-6 rounded border px-4 py-2 text-center font-medium">Sold out</p>
  }

  async function buy() {
    setBusy(true)
    setError(null)

    // The request itself can throw (network failure), and even a successful
    // response can fail to parse as JSON (a 500 rendered as an HTML error
    // page). Either way the button must come back to life with a readable
    // message — never stay stuck on "Taking you to checkout…" forever.
    try {
      const response = await fetch('/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, size, acceptedTerms }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setError(data?.error ?? 'Could not start checkout')
        setBusy(false)
        return
      }

      if (!data?.url) {
        setError('Could not start checkout')
        setBusy(false)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Could not start checkout. Please check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <div role="group" aria-label="Size" className="mb-3 flex gap-2">
        {SIZES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === size}
            onClick={() => setSize(option)}
            className={`rounded border px-4 py-2 font-medium ${
              option === size ? 'bg-black text-white' : 'bg-white text-black'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
        />
        I have read and accept the{' '}
        <a href="/legal" target="_blank" rel="noreferrer" className="underline">
          terms and privacy notice
        </a>
      </label>
      <button
        onClick={buy}
        disabled={busy || !acceptedTerms}
        className="w-full rounded bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Taking you to checkout…' : 'Buy this shirt'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}

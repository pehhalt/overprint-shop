import Link from 'next/link'

// Mounted between the demonstration banner and `{children}` in the `(frontend)`
// layout only, so the admin panel carries no storefront chrome — the same
// arrangement as DemoBanner.tsx and SiteFooter.tsx.
//
// The wordmark is split rather than set as one string so "Print" can carry the
// brand red. Screen readers still announce it as the single word "overPrint",
// because the two spans sit inside one link with no separator between them.
export function SiteHeader() {
  return (
    <header className="border-b bg-neutral-50">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="text-2xl font-extrabold tracking-tight text-neutral-900">
          over<span className="text-red-600">Print</span>
        </Link>

        <nav aria-label="Main" className="flex gap-4 text-xs font-semibold tracking-widest">
          <Link href="/products" className="uppercase text-neutral-700 hover:text-red-600">
            T-shirts
          </Link>
          <Link href="/legal" className="uppercase text-neutral-700 hover:text-red-600">
            Legal &amp; privacy
          </Link>
        </nav>
      </div>
    </header>
  )
}

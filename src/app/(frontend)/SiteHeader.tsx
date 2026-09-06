import Link from 'next/link'
import { SiteNav } from './SiteNav'

// Mounted between the demonstration banner and `{children}` in the `(frontend)`
// layout only, so the admin panel carries no storefront chrome — the same
// arrangement as DemoBanner.tsx and SiteFooter.tsx.
//
// The wordmark is split rather than set as one string so "Print" can carry the
// brand red. Screen readers still announce it as the single word "OverPrint",
// because the two spans sit inside one link with no separator between them.
// The px-8 matches the catalogue's p-8, so the wordmark and the nav line up
// with the page content rather than sitting 16px further out on each side.
export function SiteHeader() {
  return (
    <header className="border-b bg-neutral-50">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-8 py-4">
        <div>
          <Link href="/" className="text-3xl font-extrabold tracking-tight text-neutral-900">
            Over<span className="text-red-600">Print</span>
          </Link>
          {/* Outside the link, so the link's accessible name stays "OverPrint"
              rather than swallowing the tagline with it. */}
          <p className="text-center text-xs tracking-wide text-neutral-600">Get my band&rsquo;s tees</p>
        </div>

        <SiteNav />
      </div>
    </header>
  )
}

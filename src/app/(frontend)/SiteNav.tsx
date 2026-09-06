'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The only part of the header that needs the current route, so it is the only
// part that ships as a client component — SiteHeader itself stays server-rendered.
//
// A product page counts as being inside the catalogue, hence the prefix match
// rather than an equality check. The start page marks nothing: the logo owns it.
const LINKS = [
  { href: '/products', label: 'T-shirts' },
  { href: '/legal', label: 'Legal & privacy' },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Main" className="flex gap-6 text-xs font-bold tracking-widest">
      {LINKS.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            // aria-current is what a screen reader announces; the red underline
            // is the same fact drawn for everyone else. The transparent border
            // on inactive links keeps the text from shifting when it changes.
            aria-current={current ? 'page' : undefined}
            className={`border-b-2 pb-1 uppercase ${
              current
                ? 'border-red-600 text-neutral-900'
                : 'border-transparent text-neutral-700 hover:text-red-600'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

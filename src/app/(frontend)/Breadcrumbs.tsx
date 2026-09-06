import Link from 'next/link'

// A second way back, under the header, on every storefront page except the
// start page — which is the root the trail leads to, so it has none.
//
// Each page passes its own trail rather than the trail being derived from the
// URL in the layout. The layout only knows the path, so a product would read
// "products / midnight-tee"; the page already holds the product's real name.
// Four small call sites beat one clever component that needs a slug-to-title
// lookup and goes stale the moment a product is renamed.

export type Crumb = {
  label: string
  /** Omitted on the last crumb: you do not link to the page you are on. */
  href?: string
}

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-neutral-600">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li className="flex items-center">
          <Link href="/" aria-label="Home" className="hover:text-red-600">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden={true}
            >
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5.5 9.5V20h13V9.5" />
              <path d="M10 20v-5.5h4V20" />
            </svg>
          </Link>
        </li>

        {trail.map(({ label, href }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden={true} className="text-neutral-400">
              /
            </span>
            {href ? (
              <Link href={href} className="hover:text-red-600">
                {label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-neutral-900">
                {label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

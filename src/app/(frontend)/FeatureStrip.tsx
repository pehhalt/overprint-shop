// The row of claims beneath the banner on the start page.
//
// The design carries four; "Worldwide Shipping" is deliberately not one of
// them here, which leaves three — matching the shop's three product columns.
// The remaining wording is the design's, verbatim.
//
// Icons are inline SVG rather than an icon package: three line drawings do not
// justify a dependency, and inline paths render on the server with no client
// JavaScript. They are drawn symmetrically about x=12 so nothing looks skewed,
// and are aria-hidden because the text beside them already says what they say.

type Feature = {
  title: string
  blurb: string
  icon: React.ReactNode
}

const iconProps = {
  className: 'h-6 w-6 shrink-0 text-neutral-900',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
}

const FEATURES: Feature[] = [
  {
    title: 'Printed on demand',
    blurb: 'No overproduction. A smaller footprint.',
    icon: (
      <svg {...iconProps}>
        {/* leaf: a lens on the diagonal, tip top-right, with a stem running
            out past the base — the tilt is what makes it read as a leaf
            rather than as an eye */}
        <path d="M20 4c0 8.8-7.2 16-16 16C4 11.2 11.2 4 20 4z" />
        <path d="M3 21 12 12" />
      </svg>
    ),
  },
  {
    title: 'Support independent art',
    blurb: 'Wear what you believe in.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 20.5 4.9 13.4a4.6 4.6 0 1 1 7.1-5.8 4.6 4.6 0 1 1 7.1 5.8z" />
      </svg>
    ),
  },
  {
    title: 'High-quality tees',
    blurb: 'Great shirts. Long-lasting prints.',
    icon: (
      <svg {...iconProps}>
        <path d="M9 4 4 6.5 6 10.5l2-1V20h8V9.5l2 1 2-4L15 4" />
        <path d="M9 4a3 3 0 0 0 6 0" />
      </svg>
    ),
  },
]

export function FeatureStrip() {
  return (
    <section aria-label="What this shop is about" className="mt-8 border-t border-b py-5">
      <ul className="grid gap-6 sm:grid-cols-3">
        {FEATURES.map(({ title, blurb, icon }) => (
          <li key={title} className="flex items-start gap-2.5">
            {icon}
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-900">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-600">{blurb}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

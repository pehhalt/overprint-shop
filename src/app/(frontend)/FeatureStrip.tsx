// The row of claims beneath the banner on the start page.
//
// The design carries four; "Worldwide Shipping" is deliberately not one of
// them here, which leaves three — matching the shop's three product columns.
// The remaining wording is the design's, verbatim.
//
// Icons are inline SVG rather than an icon package: three line drawings do not
// justify a dependency, and inline paths render on the server with no client
// JavaScript. They are aria-hidden because the text beside them already says
// everything they say.

type Feature = {
  title: string
  blurb: string
  icon: React.ReactNode
}

const iconProps = {
  className: 'h-8 w-8 shrink-0 text-neutral-900',
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
        <path d="M4 20c9 0 16-5 16-16-9 0-16 5-16 16z" />
        <path d="M4 20c2-6 6-9 10-11" />
      </svg>
    ),
  },
  {
    title: 'Support independent art',
    blurb: 'Wear what you believe in.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 20s-7-4.4-9.2-8.6C1 8 2.7 4.5 6.3 4.5c2 0 3.3 1.1 3.9 1.9l.5.7.5-.7c.6-.8 1.9-1.9 3.9-1.9 3.6 0 5.3 3.5 3.5 6.9C19 15.6 12 20 12 20z" />
      </svg>
    ),
  },
  {
    title: 'High-quality tees',
    blurb: 'Great shirts. Long-lasting prints.',
    icon: (
      <svg {...iconProps}>
        <path d="M9 3.5 4 6l1.8 3.6L8 8.6V20h8V8.6l2.2 1L20 6l-5-2.5" />
        <path d="M9 3.5a3 3 0 0 0 6 0" />
      </svg>
    ),
  },
]

export function FeatureStrip() {
  return (
    <section aria-label="What this shop is about" className="mt-8 border-t border-b py-6">
      <ul className="grid gap-6 sm:grid-cols-3">
        {FEATURES.map(({ title, blurb, icon }) => (
          <li key={title} className="flex items-start gap-3">
            {icon}
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-900">
                {title}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">{blurb}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

import Link from 'next/link'
import { SHOP_NAME } from '@/lib/constants'

// Mounted below `{children}` in the `(frontend)` layout only. The `(payload)`
// route group has its own layout that never imports this, so the admin panel
// carries no storefront chrome — see SiteFooter.tsx's sibling, DemoBanner.tsx.
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t px-4 py-6 text-center text-sm text-neutral-600">
      <p>
        {SHOP_NAME} &copy; 2026 ·{' '}
        <Link href="/legal" className="underline">
          Legal & privacy
        </Link>
      </p>
    </footer>
  )
}

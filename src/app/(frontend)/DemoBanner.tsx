// Permanent, non-dismissible notice that this is a demonstration shop.
//
// This exists because the storefront otherwise looks and behaves like a real
// shop — real prices, a working "Buy" button — while actually running Stripe
// in test mode with no fulfilment of any kind. Stripe's own sandbox badge
// only appears after a customer has already left the site and entered card
// details, which is too late. This banner has to be visible on every
// storefront page, before checkout, and it must not be something a visitor
// can click away.
//
// Deliberately excluded from the admin panel: it lives under the
// `(frontend)` route group's layout, not a shared root layout, and the
// `(payload)` route group has its own layout that never imports this.
export function DemoBanner() {
  return (
    <div
      role="note"
      aria-label="Demonstration shop notice"
      className="border-b-4 border-amber-500 bg-amber-300 px-4 py-3 text-center text-sm font-semibold text-amber-950"
    >
      This is a demonstration shop. Payments run through Stripe in test mode only, and no goods
      are ever shipped. Please do not enter real card details or a real address.
    </div>
  )
}

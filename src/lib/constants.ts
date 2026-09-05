export const CURRENCY = 'eur' as const
export const SHOP_NAME = 'Overprint'

/** Formats an integer number of cents as a display price. */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: CURRENCY.toUpperCase(),
  }).format(cents / 100)
}

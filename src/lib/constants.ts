export const CURRENCY = 'eur' as const
export const SHOP_NAME = 'Overprint'

/** Every shirt is available in these sizes. A catalogue-wide property, like CURRENCY —
 *  deliberately not a per-product field, because every shirt comes in all four. */
export const SIZES = ['S', 'M', 'L', 'XL'] as const
export type Size = (typeof SIZES)[number]
export const SIZE_DEFAULT: Size = 'M'

export function isValidSize(value: unknown): value is Size {
  return typeof value === 'string' && (SIZES as readonly string[]).includes(value)
}

/** Formats an integer number of cents as a display price. */
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: CURRENCY.toUpperCase(),
  }).format(cents / 100)
}

import type { CollectionConfig } from 'payload'
import { isLoggedIn } from '@/access'

// Orders are never created or deleted over HTTP. The only writer of the money
// and identity fields is the Stripe webhook handler, running server-side
// through Payload's Local API with `overrideAccess: true`. A logged-in owner
// may update an order, but only to mark it shipped: every field that must
// never be hand-edited closes itself below with field-level `access.update`,
// so that a browser can never invent or alter a paid order.
export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'stripeCheckoutSessionId',
    defaultColumns: [
      'stripeCheckoutSessionId',
      'status',
      'fulfilmentStatus',
      'shippingName',
      'amountTotal',
      'paidAt',
    ],
  },
  access: {
    read: isLoggedIn,
    create: () => false,
    // Opened so the owner can mark an order shipped. Every field that must never be
    // hand-edited closes itself below with field-level `access.update`. The webhook is
    // unaffected: it writes with overrideAccess, which bypasses both.
    update: isLoggedIn,
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      // An owner marks an order shipped; the system records when. Leaving the
      // timestamp hand-editable would let the two disagree.
      ({ data, originalDoc }) => {
        const was = originalDoc?.fulfilmentStatus
        const now = data.fulfilmentStatus
        if (now === 'shipped' && was !== 'shipped') data.fulfilledAt = new Date().toISOString()
        if (now === 'unfulfilled' && was === 'shipped') data.fulfilledAt = null
        return data
      },
    ],
  },
  fields: [
    {
      name: 'stripeCheckoutSessionId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: () => false },
      admin: { description: "Stripe Checkout Session id. The idempotency key for this order." },
    },
    { name: 'stripePaymentIntentId', type: 'text', access: { update: () => false } },
    { name: 'email', type: 'email', access: { update: () => false } },
    { name: 'shippingName', type: 'text', access: { update: () => false } },
    {
      name: 'shippingAddress',
      type: 'group',
      access: { update: () => false },
      fields: [
        { name: 'line1', type: 'text' },
        { name: 'line2', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'postalCode', type: 'text' },
        { name: 'country', type: 'text' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      access: { update: () => false },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Paid', value: 'paid' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    {
      name: 'amountTotal',
      type: 'number',
      required: true,
      access: { update: () => false },
      admin: { description: 'Total charged, in cents.' },
    },
    { name: 'paidAt', type: 'date', access: { update: () => false } },
    {
      name: 'termsAcceptedAt',
      type: 'date',
      access: { update: () => false },
      admin: {
        readOnly: true,
        description: 'When the server received the checkout request carrying the terms consent.',
      },
    },
    {
      name: 'fulfilmentStatus',
      type: 'select',
      required: true,
      defaultValue: 'unfulfilled',
      options: [
        { label: 'Unfulfilled', value: 'unfulfilled' },
        { label: 'Shipped', value: 'shipped' },
      ],
    },
    {
      name: 'fulfilledAt',
      type: 'date',
      access: { update: () => false },
      admin: { readOnly: true, description: 'Set automatically when marked shipped.' },
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      access: { update: () => false },
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products' },
        {
          name: 'nameSnapshot',
          type: 'text',
          required: true,
          admin: { description: 'The name as it was at purchase time.' },
        },
        {
          name: 'unitAmountSnapshot',
          type: 'number',
          required: true,
          admin: { description: 'The unit price actually charged, in cents.' },
        },
        {
          // Not required, because orders placed before sizes existed have no size and
          // never will. Payload validates the whole merged document on update, not just
          // the incoming fields, so a `required` here would refuse every write to those
          // rows — marking one shipped, redacting one for a GDPR erasure request, or a
          // late Stripe webhook landing on one. The guarantee that new orders always
          // carry a valid size lives where the size is chosen: `isValidSize` in
          // src/app/(frontend)/shop/checkout/route.ts, the only code path that creates
          // an order.
          name: 'sizeSnapshot',
          type: 'text',
          required: false,
          admin: { description: 'The size chosen at purchase. What the owner prints.' },
        },
        { name: 'quantity', type: 'number', required: true, defaultValue: 1 },
      ],
    },
  ],
}

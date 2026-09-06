import type { CollectionConfig } from 'payload'
import { isLoggedIn } from '@/access'

// Orders are never written over HTTP. The only writer is the Stripe webhook
// handler, running server-side, through Payload's Local API with
// `overrideAccess: true`. Every other create/update/delete path — including an
// authenticated admin hitting the REST or GraphQL API — must be refused, so
// that a browser can never invent or alter a paid order.
export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'stripeCheckoutSessionId',
    defaultColumns: ['stripeCheckoutSessionId', 'status', 'amountTotal', 'paidAt'],
  },
  access: {
    read: isLoggedIn,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'stripeCheckoutSessionId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: "Stripe Checkout Session id. The idempotency key for this order." },
    },
    { name: 'stripePaymentIntentId', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
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
      admin: { description: 'Total charged, in cents.' },
    },
    { name: 'paidAt', type: 'date' },
    {
      name: 'items',
      type: 'array',
      required: true,
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
          name: 'sizeSnapshot',
          type: 'text',
          required: true,
          admin: { description: 'The size chosen at purchase. What the owner prints.' },
        },
        { name: 'quantity', type: 'number', required: true, defaultValue: 1 },
      ],
    },
  ],
}

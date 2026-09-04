import type { CollectionConfig } from 'payload'
import { anyone, isLoggedIn } from '@/access'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'price', 'soldOut'] },
  access: { read: anyone, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL segment, lowercase and hyphenated, e.g. midnight-tee' },
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 1,
      admin: { description: 'Price in cents, as an integer. 2500 means EUR 25.00.' },
    },
    { name: 'description', type: 'textarea', required: true },
    { name: 'photo', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'soldOut',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Hides the buy button and refuses checkout.' },
    },
  ],
}

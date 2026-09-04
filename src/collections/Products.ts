import type { CollectionConfig, NumberFieldSingleValidation } from 'payload'
import { anyone, isLoggedIn } from '@/access'

// Prices are integers in minor units (cents); 2500 means EUR 25.00. Payload's
// default `number` field validation only checks min/max, so a fraction like
// 25.5 would otherwise be accepted. This composes the same required/min/max
// behaviour the default validator provides, then additionally rejects
// non-integers.
export const validatePrice: NumberFieldSingleValidation = (value, { required, min, max }) => {
  if (value === undefined || value === null || (value as unknown) === '') {
    return required ? 'Price is required.' : true
  }

  const numberValue = typeof value === 'number' ? value : Number(value)

  if (Number.isNaN(numberValue)) {
    return 'Please enter a valid number.'
  }

  if (typeof min === 'number' && numberValue < min) {
    return `Price must be at least ${min} cent(s).`
  }

  if (typeof max === 'number' && numberValue > max) {
    return `Price must be at most ${max} cent(s).`
  }

  if (!Number.isInteger(numberValue)) {
    return 'Price must be a whole number of cents (e.g. 2500 for EUR 25.00) — fractional cents are not allowed.'
  }

  return true
}

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
      validate: validatePrice,
      admin: {
        step: 1,
        description: 'Price in cents, as an integer. 2500 means EUR 25.00.',
      },
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

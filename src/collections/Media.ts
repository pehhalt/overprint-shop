import type { CollectionConfig } from 'payload'
import { anyone, isLoggedIn } from '@/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: anyone, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
  upload: true,
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'Describes the image for screen readers.' },
    },
  ],
}

import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { anyone, isLoggedIn } from '@/access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: anyone, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
  upload: true,
  hooks: {
    // `products.photo` is a required (NOT NULL) relationship, so deleting a media
    // item still in use would otherwise abort with a raw Postgres NOT NULL
    // violation. Refuse the delete at the application layer with a clear message
    // instead of letting that error surface in the admin UI.
    beforeDelete: [
      async ({ req, id }) => {
        const referencingProducts = await req.payload.find({
          collection: 'products',
          where: { photo: { equals: id } },
          depth: 0,
          limit: 0,
          pagination: false,
          req,
        })

        if (referencingProducts.totalDocs > 0) {
          const names = referencingProducts.docs.map((product) => product.name).join(', ')
          const isPlural = referencingProducts.totalDocs > 1
          throw new APIError(
            `This photo is still used by ${isPlural ? 'products' : 'product'} "${names}". Change or remove ${isPlural ? 'their' : 'its'} photo before deleting this file.`,
            400,
            undefined,
            true,
          )
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'Describes the image for screen readers.' },
    },
    {
      name: 'generatedBy',
      type: 'select',
      required: true,
      defaultValue: 'unknown',
      options: [
        { label: 'AI-generated', value: 'ai' },
        { label: 'Photograph', value: 'photograph' },
        { label: 'Unknown', value: 'unknown' },
      ],
      admin: {
        description:
          'How this image was made. AI-generated images are labelled on the public site — the EU AI Act requires disclosing artificially generated image content.',
      },
    },
  ],
}

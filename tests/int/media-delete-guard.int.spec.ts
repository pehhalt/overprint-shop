/**
 * Finding 1 (Critical): deleting a photo that a product uses must be refused
 * with a clear, human-readable error — not an opaque database exception.
 *
 * `products.photo_id` is `integer NOT NULL` with `ON DELETE set null`, so a raw
 * delete of a referenced media row would otherwise abort with an unhandled
 * Postgres NOT NULL violation. `src/collections/Media.ts` adds a `beforeDelete`
 * hook that checks for referencing products first and throws a Payload
 * `APIError` naming them.
 *
 * These tests run against the live development database (see `.env`
 * `DATABASE_URI`). They create their own fixtures, clearly named, and remove
 * them in `afterAll` regardless of outcome — the seeded Midnight/Coral
 * Sunset/Forest Ridge products and `dev@overprint.local` are never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@payload-config'

const FIXTURE_ALT = 'Task7 Fixture: media-delete-guard photo'
const FIXTURE_SLUG = 'task7-fixture-media-delete-guard'
const FIXTURE_NAME = 'Task7 Fixture Product (media-delete-guard)'

async function makePhotoBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer()
}

describe('Media beforeDelete guard (Finding 1)', () => {
  let payload: Payload
  let mediaId: number
  let productId: number

  beforeAll(async () => {
    payload = await getPayload({ config })

    const buffer = await makePhotoBuffer()
    const media = await payload.create({
      collection: 'media',
      data: { alt: FIXTURE_ALT },
      file: {
        data: buffer,
        mimetype: 'image/png',
        name: 'task7-media-delete-guard.png',
        size: buffer.length,
      },
    })
    mediaId = media.id

    const product = await payload.create({
      collection: 'products',
      data: {
        name: FIXTURE_NAME,
        slug: FIXTURE_SLUG,
        price: 1999,
        description: 'Fixture product created for the Task 7 media-delete-guard test.',
        photo: mediaId,
        soldOut: false,
      },
    })
    productId = product.id
  })

  afterAll(async () => {
    // Clean up whatever still exists, whatever the test outcome was.
    const remainingProducts = await payload.find({
      collection: 'products',
      where: { slug: { equals: FIXTURE_SLUG } },
      limit: 10,
    })
    for (const doc of remainingProducts.docs) {
      await payload.delete({ collection: 'products', id: doc.id }).catch(() => {})
    }

    const remainingMedia = await payload.find({
      collection: 'media',
      where: { alt: { equals: FIXTURE_ALT } },
      limit: 10,
    })
    for (const doc of remainingMedia.docs) {
      await payload.delete({ collection: 'media', id: doc.id }).catch(() => {})
    }
  })

  it('refuses to delete a media item referenced by a product, naming the product', async () => {
    await expect(payload.delete({ collection: 'media', id: mediaId })).rejects.toThrow(
      new RegExp(FIXTURE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )

    // The media row must still exist after the refusal.
    const stillThere = await payload.findByID({ collection: 'media', id: mediaId })
    expect(stillThere.id).toBe(mediaId)
  })

  it('allows deleting the media item once the referencing product is gone', async () => {
    await payload.delete({ collection: 'products', id: productId })

    const deleted = await payload.delete({ collection: 'media', id: mediaId })
    expect(deleted.id).toBe(mediaId)

    await expect(payload.findByID({ collection: 'media', id: mediaId })).rejects.toThrow()
  })
})

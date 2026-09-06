/**
 * Finding 2 (Important): nothing prevented a fractional price.
 *
 * `price` is `numeric NOT NULL` in Postgres with no CHECK constraint — Payload's
 * default mapping for a `number` field. The project's constraint is "prices are
 * integers in minor units (cents)". `src/collections/Products.ts` adds a custom
 * `validate` (exported as `validatePrice`) that rejects non-integers, on top of
 * the existing `required`/`min` behaviour, and sets `admin.step: 1`.
 *
 * This closes the gap at the application layer (admin UI + Local API + REST/GraphQL,
 * since Payload always runs field validation for writes). It does NOT add a
 * database-level CHECK constraint — a direct SQL write could still insert a
 * fraction. Adding that would require hand-editing the generated migration,
 * which this task explicitly avoids (it would be reverted by the next
 * `migrate:create` and silently diverge from the schema snapshot).
 *
 * The integration tests below run against the live development database and
 * prove the Local API path (which is what the admin panel and REST/GraphQL
 * handlers ultimately call through). They create their own fixtures and clean
 * up in `afterAll`, never touching the seeded Midnight/Coral Sunset/Forest
 * Ridge products.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@payload-config'
import { validatePrice } from '@/collections/Products'

const FIXTURE_ALT = 'Task7 Fixture: product-price image'
const FRACTIONAL_SLUG = 'task7-fixture-price-fractional'
const INTEGER_SLUG = 'task7-fixture-price-integer'

describe('validatePrice (pure function)', () => {
  const baseOptions = { required: true, min: 1 } as never

  it('rejects a fractional value', () => {
    expect(validatePrice(25.5, baseOptions)).toMatch(/whole number/i)
  })

  it('accepts an integer value', () => {
    expect(validatePrice(2500, baseOptions)).toBe(true)
  })

  it('still enforces required', () => {
    expect(validatePrice(null, baseOptions)).toMatch(/required/i)
  })

  it('still enforces min', () => {
    expect(validatePrice(0, baseOptions)).toMatch(/at least/i)
  })
})

describe('Product price validation, end to end (Finding 2)', () => {
  let payload: Payload
  let mediaId: number

  beforeAll(async () => {
    payload = await getPayload({ config })

    const buffer = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer()

    const media = await payload.create({
      collection: 'media',
      data: { alt: FIXTURE_ALT, generatedBy: 'photograph' },
      file: {
        data: buffer,
        mimetype: 'image/png',
        name: 'task7-product-price.png',
        size: buffer.length,
      },
    })
    mediaId = media.id
  })

  afterAll(async () => {
    const products = await payload.find({
      collection: 'products',
      where: {
        slug: { in: [FRACTIONAL_SLUG, INTEGER_SLUG] },
      },
      limit: 10,
    })
    for (const doc of products.docs) {
      await payload.delete({ collection: 'products', id: doc.id }).catch(() => {})
    }

    await payload.delete({ collection: 'media', id: mediaId }).catch(() => {})
  })

  it('rejects a fractional price (25.5) through the Local API', async () => {
    // Payload wraps field-validation failures in a ValidationError whose top-level
    // `message` is a generic "The following field is invalid: Price" — the actual
    // message our `validatePrice` returned lives in `error.data.errors[].message`.
    let caught: unknown
    try {
      await payload.create({
        collection: 'products',
        data: {
          name: 'Task7 Fixture Product (fractional price)',
          slug: FRACTIONAL_SLUG,
          price: 25.5,
          description: 'Should be rejected by validatePrice.',
          image: mediaId,
        },
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeDefined()
    const validationErrors = (caught as { data?: { errors?: Array<{ message: string }> } }).data
      ?.errors
    expect(validationErrors).toBeDefined()
    expect(validationErrors?.some((e) => /whole number/i.test(e.message))).toBe(true)

    const found = await payload.find({
      collection: 'products',
      where: { slug: { equals: FRACTIONAL_SLUG } },
    })
    expect(found.totalDocs).toBe(0)
  })

  it('accepts an integer price (2500) through the Local API', async () => {
    const created = await payload.create({
      collection: 'products',
      data: {
        name: 'Task7 Fixture Product (integer price)',
        slug: INTEGER_SLUG,
        price: 2500,
        description: 'Should be accepted.',
        image: mediaId,
      },
    })

    expect(created.price).toBe(2500)
  })
})

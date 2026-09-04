/**
 * Development database seed script.
 *
 * Idempotent: re-running this script never creates duplicates. It:
 *   1. Creates a development admin user (dev@overprint.local) if one doesn't exist yet.
 *   2. Creates three t-shirt products, each with a locally-generated placeholder
 *      photo uploaded through Payload's Local API (which round-trips through the
 *      Vercel Blob storage adapter configured in payload.config.ts).
 *
 * Run with:  npm run seed
 */
import 'dotenv/config'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'

const DEV_ADMIN_EMAIL = 'dev@overprint.local'
const DEV_ADMIN_FALLBACK_PASSWORD = 'dev-only-CHANGE-ME-123!'

type ProductSeed = {
  name: string
  slug: string
  /** integer cents */
  price: number
  description: string
  /** solid background colour used to generate the placeholder photo */
  color: { r: number; g: number; b: number }
  alt: string
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Midnight Tee',
    slug: 'midnight-tee',
    price: 2500,
    description:
      'A classic crew-neck in solid black, printed with a minimal line-art design. Heavyweight 100% combed cotton that holds its shape wash after wash.',
    color: { r: 17, g: 17, b: 20 },
    alt: 'Front view of the Midnight Tee, a solid black crew-neck t-shirt',
  },
  {
    name: 'Coral Sunset Tee',
    slug: 'coral-sunset-tee',
    price: 2800,
    description:
      'A warm coral tee with an oversized graphic print inspired by summer evenings. Relaxed unisex fit in soft ring-spun cotton.',
    color: { r: 232, g: 108, b: 85 },
    alt: 'Front view of the Coral Sunset Tee, a coral-orange oversized-fit t-shirt',
  },
  {
    name: 'Forest Ridge Tee',
    slug: 'forest-ridge-tee',
    price: 2600,
    description:
      'A deep forest-green tee featuring a small embroidered mountain ridge logo on the chest. Garment-dyed for a soft, lived-in feel from the first wear.',
    color: { r: 43, g: 74, b: 51 },
    alt: 'Front view of the Forest Ridge Tee, a forest-green t-shirt with a small chest logo',
  },
]

async function generatePhotoBuffer(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 1200,
      height: 1200,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer()
}

async function main() {
  const payload = await getPayload({ config })

  // --- 1. Development admin user ---
  const existingAdmins = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_ADMIN_EMAIL } },
    limit: 1,
  })

  if (existingAdmins.totalDocs === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD
    if (!password) {
      console.warn(
        `SEED_ADMIN_PASSWORD not set — using the fallback development password (${DEV_ADMIN_FALLBACK_PASSWORD}). Set SEED_ADMIN_PASSWORD in .env for a real value.`,
      )
    }
    await payload.create({
      collection: 'users',
      data: {
        email: DEV_ADMIN_EMAIL,
        password: password || DEV_ADMIN_FALLBACK_PASSWORD,
      },
    })
    console.log(`Created development admin user: ${DEV_ADMIN_EMAIL}`)
  } else {
    console.log(`Development admin user already exists: ${DEV_ADMIN_EMAIL}`)
  }

  // --- 2 & 3. Products with generated photos ---
  for (const product of PRODUCTS) {
    const existing = await payload.find({
      collection: 'products',
      where: { slug: { equals: product.slug } },
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      console.log(`Product already exists, skipping: ${product.slug}`)
      continue
    }

    const buffer = await generatePhotoBuffer(product.color)
    const filename = `${product.slug}.png`

    const media = await payload.create({
      collection: 'media',
      data: { alt: product.alt },
      file: {
        data: buffer,
        mimetype: 'image/png',
        name: filename,
        size: buffer.length,
      },
    })

    const created = await payload.create({
      collection: 'products',
      data: {
        name: product.name,
        slug: product.slug,
        price: product.price,
        description: product.description,
        photo: media.id,
        soldOut: false,
      },
    })

    console.log(
      `Created product: ${created.name} (slug=${created.slug}, price=${created.price}c, photo url=${media.url})`,
    )
  }

  console.log('Seed complete.')
  process.exit(0)
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})

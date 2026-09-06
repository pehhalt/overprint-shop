/**
 * Development database seed script.
 *
 * Idempotent: re-running this script never creates duplicates. It:
 *   1. Creates a development admin user (dev@overprint.local) if one doesn't exist yet.
 *   2. Creates three t-shirt products, each with a locally-generated placeholder
 *      image uploaded through Payload's Local API (which round-trips through the
 *      Vercel Blob storage adapter configured in payload.config.ts).
 *
 * Guarded: refuses to run unless the target database can be positively confirmed to be
 * non-production. See assertSafeToSeed() below — this is what stops `npm run seed` from
 * writing a fake admin account and demo products into the live shop once production exists.
 *
 * Run with:  npm run seed
 */
import 'dotenv/config'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'

/**
 * Extracts a Supabase project ref from a Postgres connection string, supporting both
 * connection shapes used in this project:
 *   - Pooler (session/transaction): postgres.PROJECTREF@aws-...pooler.supabase.com
 *   - Direct connection:            postgres@db.PROJECTREF.supabase.co
 * Returns null when the URI isn't a recognisable Supabase connection string — that is
 * treated as "cannot determine", never as "safe".
 */
function extractSupabaseProjectRef(databaseUri: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(databaseUri)
  } catch {
    return null
  }

  const username = decodeURIComponent(parsed.username)
  if (username.startsWith('postgres.')) {
    return username.slice('postgres.'.length) || null
  }

  const directMatch = /^db\.([^.]+)\.supabase\.co$/.exec(parsed.hostname)
  if (directMatch) {
    return directMatch[1]
  }

  return null
}

function refuseToSeed(reason: string): never {
  console.error(
    [
      '',
      'Seed refused.',
      '',
      reason,
      '',
      'This script creates a real admin account and demo products — running it against a',
      'production database would put fake data in the live shop. If you are certain the',
      'target database is safe, override deliberately with:',
      '',
      '  SEED_ALLOW_UNSAFE=1 npm run seed',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

/**
 * Fails closed: seeding proceeds only when the target can be positively confirmed to be
 * non-production, or the caller has explicitly opted in with SEED_ALLOW_UNSAFE=1.
 */
function assertSafeToSeed(): void {
  if (process.env.SEED_ALLOW_UNSAFE === '1') {
    console.warn(
      'SEED_ALLOW_UNSAFE=1 is set — skipping the production-database guard. Proceeding at your own risk.',
    )
    return
  }

  if (process.env.NODE_ENV === 'production') {
    refuseToSeed('NODE_ENV is "production".')
  }

  const databaseUri = process.env.DATABASE_URI
  if (!databaseUri) {
    refuseToSeed('DATABASE_URI is not set, so the target database cannot be verified.')
  }

  const expectedRef = process.env.SEED_DEV_PROJECT_REF
  if (!expectedRef) {
    refuseToSeed(
      'SEED_DEV_PROJECT_REF is not set, so this script cannot confirm DATABASE_URI points at ' +
        'the development Supabase project. Set SEED_DEV_PROJECT_REF in your .env to the dev ' +
        'project ref.',
    )
  }

  const actualRef = extractSupabaseProjectRef(databaseUri)
  if (!actualRef) {
    refuseToSeed(
      'DATABASE_URI does not look like a recognisable Supabase connection string, so its ' +
        'target project cannot be verified.',
    )
  }

  if (actualRef !== expectedRef) {
    refuseToSeed(
      `DATABASE_URI targets Supabase project "${actualRef}", which does not match the known ` +
        `development project ("${expectedRef}" from SEED_DEV_PROJECT_REF).`,
    )
  }
}

const DEV_ADMIN_EMAIL = 'dev@overprint.local'

// There is deliberately NO fallback password here.
//
// There used to be one, as a convenience. It was a real vulnerability: this
// repository is public, the preview deployment serves the development database
// over the open internet at /admin, and anyone who read this file could sign
// into it. A default credential in a public repository is a published
// credential.
//
// SEED_ADMIN_PASSWORD is required. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

type ProductSeed = {
  name: string
  slug: string
  /** integer cents */
  price: number
  description: string
  /** solid background colour used to generate the placeholder image */
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
    alt: 'The Midnight Tee, a solid black crew-neck t-shirt',
  },
  {
    name: 'Coral Sunset Tee',
    slug: 'coral-sunset-tee',
    price: 2800,
    description:
      'A warm coral tee with an oversized graphic print inspired by summer evenings. Relaxed unisex fit in soft ring-spun cotton.',
    color: { r: 232, g: 108, b: 85 },
    alt: 'The Coral Sunset Tee, a coral-orange oversized-fit t-shirt',
  },
  {
    name: 'Forest Ridge Tee',
    slug: 'forest-ridge-tee',
    price: 2600,
    description:
      'A deep forest-green tee featuring a small embroidered mountain ridge logo on the chest. Garment-dyed for a soft, lived-in feel from the first wear.',
    color: { r: 43, g: 74, b: 51 },
    alt: 'The Forest Ridge Tee, a forest-green t-shirt with a small chest logo',
  },
]

async function generateImageBuffer(color: { r: number; g: number; b: number }): Promise<Buffer> {
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
  assertSafeToSeed()

  const payload = await getPayload({ config })

  // --- 1. Development admin user ---
  const existingAdmins = await payload.find({
    collection: 'users',
    where: { email: { equals: DEV_ADMIN_EMAIL } },
    limit: 1,
  })

  if (existingAdmins.totalDocs === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD
    if (!password || password.length < 16) {
      throw new Error(
        'SEED_ADMIN_PASSWORD is required and must be at least 16 characters.\n\n' +
          'This account can sign into the admin panel of whichever database\n' +
          'DATABASE_URI points at, and the preview deployment serves that database\n' +
          'over the public internet. Refusing to create it with a weak or absent\n' +
          'password.\n\n' +
          'Generate one with:\n' +
          '  node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"\n' +
          'then set SEED_ADMIN_PASSWORD in .env',
      )
    }
    await payload.create({
      collection: 'users',
      data: {
        email: DEV_ADMIN_EMAIL,
        password,
      },
    })
    console.log(`Created development admin user: ${DEV_ADMIN_EMAIL}`)
  } else {
    console.log(`Development admin user already exists: ${DEV_ADMIN_EMAIL}`)
  }

  // --- 2 & 3. Products with generated images ---
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

    const buffer = await generateImageBuffer(product.color)
    const filename = `${product.slug}.png`

    const media = await payload.create({
      collection: 'media',
      // 'photograph', not 'ai': these are sharp-rendered solid colours, not model output.
      data: { alt: product.alt, generatedBy: 'photograph' },
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
        image: media.id,
        soldOut: false,
      },
    })

    console.log(
      `Created product: ${created.name} (slug=${created.slug}, price=${created.price}c, image url=${media.url})`,
    )
  }

  console.log('Seed complete.')
  process.exit(0)
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})

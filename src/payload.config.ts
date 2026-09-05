import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Products } from './collections/Products'
import { Orders } from './collections/Orders'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Products, Orders],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      // Supabase's session-mode pooler caps this project at 15 total connections,
      // shared across every process that's connected at once. The right pool
      // size is different in production and in local development, so it is not
      // a single flat number:
      //
      //   * Production gets 3. Payload holds one connection for its own
      //     initialisation and needs a further one to run a query, so a pool of
      //     1 can never satisfy a single request — it deadlocks both
      //     `payload migrate` (hangs forever after "Reading migration files",
      //     no error, no timeout) and every database-backed page (504 Vercel
      //     Runtime Timeout, while a route that never touches the database,
      //     like /admin, serves normally — which makes it look like a data
      //     problem rather than a pool problem). Payload needs at least 2; 3
      //     leaves a little headroom without being reckless against Supabase's
      //     15-connection ceiling, which is shared across every connected
      //     process at once — roughly 5 concurrent serverless function
      //     instances at a pool size of 3 each.
      //   * Local development gets 5. `next dev` is one long-lived process
      //     serving many concurrent requests, alongside e2e helper scripts
      //     that open their own Payload instance at the same time, so it
      //     genuinely benefits from more headroom than production does: 5 is
      //     the value established empirically after the e2e suite exhausted
      //     the pooler at a lower number.
      //
      // DO NOT set this to 1 in any environment — see the production deadlock
      // above.
      max: process.env.NODE_ENV === 'production' ? 3 : 5,
    },
    // Schema changes travel by migration in EVERY environment, never by push.
    //
    // Payload's dev-only push mode writes a `batch: -1` row into
    // payload_migrations. `payload migrate` sees that row and prompts
    // "data loss will occur. Would you like to proceed?" — a prompt with no TTY
    // in CI, so the deploy hangs indefinitely rather than failing. It cost us a
    // 22-minute build before we found it, and there is no flag to bypass it
    // (see @payloadcms/drizzle/dist/migrate.js).
    //
    // Managing development by migration too keeps every environment identical
    // and stops that row from ever being written. The cost is that a schema
    // change now needs `payload migrate:create` followed by `payload migrate`,
    // instead of appearing automatically on the next `npm run dev`.
    push: false,
  }),
  sharp,
  plugins: [
    vercelBlobStorage({
      enabled: true,
      // Media is public-read (`access.read: anyone`) and the Blob store itself is
      // public, so serve files directly from Blob's CDN instead of proxying every
      // request through this app's own /api/media/file route.
      collections: { media: { disablePayloadAccessControl: true } },
      clientUploads: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }),
  ],
})

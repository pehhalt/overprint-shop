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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Products],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
      // Supabase's session-mode pooler caps this project at 15 total connections,
      // shared across every process that's connected at once.
      //
      // Locally, `next dev` is one long-lived process serving many concurrent
      // requests (plus e2e helper scripts that spin up their own Payload instance
      // alongside it), so it genuinely benefits from several connections: 5 is
      // what we established empirically running the e2e suite.
      //
      // In production on Vercel, each function instance holds its own pool and
      // handles one request at a time, so a pool bigger than 1 buys a single
      // instance nothing while multiplying the connection count across
      // instances. max: 1 lets up to 15 instances run concurrently instead of 3;
      // a bigger max here would make it easier to blow the pooler's cap under
      // real traffic than it was to blow it locally with two dev processes.
      max: process.env.NODE_ENV === 'production' ? 1 : 5,
    },
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

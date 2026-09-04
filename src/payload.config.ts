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
      // Supabase's session-mode pooler caps this project at 15 total connections.
      // The default pg Pool max is 10, which alone is fine, but a second Payload
      // instance (e.g. an e2e helper script) running alongside the dev server can
      // push the combined total over the limit. Keep our per-instance ceiling low.
      max: 5,
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

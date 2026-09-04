import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // tests/unit is DB-free (no Payload Local API, no DATABASE_URI needed) — that's what
    // CI runs via `npm run test:unit`. tests/int exercises Payload's Local API against a
    // live Supabase database and only runs where DATABASE_URI is set (i.e. locally).
    include: ['tests/unit/**/*.spec.ts', 'tests/int/**/*.int.spec.ts'],
  },
})

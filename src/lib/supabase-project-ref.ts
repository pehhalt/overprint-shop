/**
 * Extracts a Supabase project ref from a Postgres connection string, supporting both
 * connection shapes used in this project:
 *   - Pooler (session/transaction): postgres.PROJECTREF@aws-...pooler.supabase.com
 *   - Direct connection:            postgres@db.PROJECTREF.supabase.co
 * Returns null when the URI isn't a recognisable Supabase connection string — that is
 * treated as "cannot determine", never as "safe".
 *
 * Shared by `scripts/seed.ts` and `src/lib/order-admin.ts` so the two database-target
 * guards that depend on it can't drift apart.
 */
export function extractSupabaseProjectRef(databaseUri: string): string | null {
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

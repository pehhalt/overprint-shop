/**
 * Shared library for Task 11's export, erasure and retention scripts. Everything here
 * is a plain function over Payload's Local API — none of it is a CLI. `dotenv/config`
 * is loaded first (before `@payload-config`) so this works whether it's imported from a
 * test (whose setup already loaded it) or from a `tsx`-run script (which hasn't).
 */
import 'dotenv/config'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import type { Order } from '@/payload-types'
import { extractSupabaseProjectRef } from './supabase-project-ref'

/**
 * Looks up orders by email or Stripe Checkout Session id, for export and erasure
 * requests. `orders` read access is admin-only and these callers run outside any
 * request/session context, so this always calls the Local API with `overrideAccess:
 * true`. `pagination: false` returns every match — a GDPR export can't stop at the
 * first page.
 */
export async function findOrders({
  email,
  sessionId,
}: {
  email?: string
  sessionId?: string
}): Promise<Order[]> {
  if (!email && !sessionId) {
    throw new Error('findOrders requires an email or a sessionId.')
  }

  const conditions: Where[] = []
  if (email) conditions.push({ email: { equals: email } })
  if (sessionId) conditions.push({ stripeCheckoutSessionId: { equals: sessionId } })

  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'orders',
    where: conditions.length > 1 ? { and: conditions } : conditions[0],
    pagination: false,
    overrideAccess: true,
  })

  return docs
}

/**
 * Erasure redacts, it does not delete the row: `amountTotal`, `status`, `paidAt`,
 * `items` (including `sizeSnapshot`) and `termsAcceptedAt` are a commercial and consent
 * record with their own retention basis and are left untouched. Only identity — `email`,
 * `shippingName`, and the whole `shippingAddress` group, cleared as a unit — is wiped.
 * That satisfies Art. 17: the row survives as a sale record, but is no longer personal
 * data. Every field cleared here is `access: { update: () => false }` on the collection,
 * so this must run with `overrideAccess: true` or the write is silently dropped.
 */
export async function redactOrder(id: number): Promise<Order> {
  const payload = await getPayload({ config })

  return payload.update({
    collection: 'orders',
    id,
    overrideAccess: true,
    data: {
      email: null,
      shippingName: null,
      shippingAddress: { line1: null, line2: null, city: null, postalCode: null, country: null },
    },
  })
}

const OVERRIDE_VAR = 'ORDER_ADMIN_ALLOW_UNSAFE'

/**
 * Fails closed before any script here reads, exports, redacts or deletes an order.
 * Reuses `scripts/seed.ts`'s guard shape — the same `extractSupabaseProjectRef`,
 * comparing `DATABASE_URI` against `SEED_DEV_PROJECT_REF` — but not its ordering
 * defect: `assertSafeToSeed` checks its override first and returns early, so a stray
 * `SEED_ALLOW_UNSAFE=1` bypasses its production guard too (README's Known limitations).
 *
 * Here `NODE_ENV === 'production'` is checked first, unconditionally: nothing below it,
 * including `ORDER_ADMIN_ALLOW_UNSAFE`, is even read until that check has passed, so no
 * value of the override can rescue a production target. The override only rescues a
 * project-ref mismatch, for a script deliberately pointed at a non-dev target that is
 * not production. It is a distinct variable from the seed script's, so an override left
 * lying around for seeding can't silently authorise data erasure.
 */
export function assertSafeTarget(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing: NODE_ENV is "production".')
  }

  const databaseUri = process.env.DATABASE_URI
  if (!databaseUri) {
    throw new Error('Refusing: DATABASE_URI is not set, so the target database cannot be verified.')
  }

  if (process.env[OVERRIDE_VAR] === '1') {
    console.warn(`${OVERRIDE_VAR}=1 is set — skipping the project-ref guard. Proceeding at your own risk.`)
    return
  }

  const expectedRef = process.env.SEED_DEV_PROJECT_REF
  if (!expectedRef) {
    throw new Error(
      'Refusing: SEED_DEV_PROJECT_REF is not set, so this script cannot confirm DATABASE_URI points at ' +
        'the development Supabase project.',
    )
  }

  const actualRef = extractSupabaseProjectRef(databaseUri)
  if (!actualRef) {
    throw new Error(
      'Refusing: DATABASE_URI does not look like a recognisable Supabase connection string, so its ' +
        'target project cannot be verified.',
    )
  }

  if (actualRef !== expectedRef) {
    throw new Error(
      `Refusing: DATABASE_URI targets Supabase project "${actualRef}", which does not match the known ` +
        `development project ("${expectedRef}" from SEED_DEV_PROJECT_REF).`,
    )
  }
}

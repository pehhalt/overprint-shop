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

const OVERRIDE_VAR = 'ORDER_ADMIN_ALLOW_UNSAFE'

/**
 * Fails closed before this module reads, exports, redacts or deletes an order.
 * `findOrders`, `redactOrder` and `deleteOrder` all call this as their first statement, so
 * the guard holds regardless of caller discipline — no script that imports this module can
 * skip it by omission. Task 11's scripts also call it explicitly at their own startup,
 * before printing anything; that is not redundant with the internal call, it is what turns
 * a refusal into a readable message instead of a stack trace surfacing from inside a
 * lookup, an update or a delete.
 *
 * Reuses `scripts/seed.ts`'s guard shape — the same `extractSupabaseProjectRef`,
 * comparing `DATABASE_URI` against `SEED_DEV_PROJECT_REF` — but not its ordering defect:
 * `assertSafeToSeed` checks its override first and returns early, so a stray
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

/**
 * Looks up orders by email or Stripe Checkout Session id, for export and erasure
 * requests. `orders` read access is admin-only and these callers run outside any
 * request/session context, so this always calls the Local API with `overrideAccess:
 * true`. `pagination: false` returns every match — a GDPR export can't stop at the
 * first page.
 *
 * `assertSafeTarget()` runs first: a data-subject export pulled from the wrong database
 * is still a disclosure, even though this is a read, not a write.
 *
 * `depth: 0` leaves `items[].product` as a raw id rather than populating the full
 * Product (and its Media). The order's own `items[]` snapshots — `nameSnapshot`,
 * `unitAmountSnapshot`, `sizeSnapshot` — already carry what the customer ordered; the
 * default depth would hand an Art. 15/20 export request our catalogue and image
 * records along with the data subject's own.
 */
export async function findOrders({
  email,
  sessionId,
}: {
  email?: string
  sessionId?: string
}): Promise<Order[]> {
  assertSafeTarget()

  if (!email && !sessionId) {
    throw new Error('findOrders requires an email or a sessionId.')
  }

  const conditions: Where[] = []
  if (email) conditions.push({ email: { equals: email } })
  if (sessionId) conditions.push({ stripeCheckoutSessionId: { equals: sessionId } })

  // No `key` here, deliberately: whether Payload's logger writes to stdout or stderr is
  // controlled by src/payload.config.ts's own PAYLOAD_LOG_TO_STDERR-gated `logger` field
  // on `config` itself, not by call order or by which cache slot this ends up in. Adding
  // a `key` (a separate cached instance, still built from this same `config`) would not
  // break that — but a `config` swapped out for one without the gated `logger` field
  // would, silently, for scripts/export-order.ts.
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'orders',
    where: conditions.length > 1 ? { and: conditions } : conditions[0],
    depth: 0,
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
 * data.
 *
 * `assertSafeTarget()` runs first, as this function's first statement — not just at the
 * call sites in Task 11's scripts — so erasure refuses regardless of whether a caller
 * remembered to check.
 *
 * Every field cleared here is `access: { update: () => false }` on the collection, which
 * closes it to the HTTP and admin paths, not to server-side tooling. Payload's Local API
 * already defaults `overrideAccess` to `true` when the option is omitted; the hazard
 * that field-level access guards against is an explicit `overrideAccess: false` (or a
 * caller with a real `req.user` and no override), not omission. `overrideAccess: true`
 * is passed here anyway, as a caller shouldn't have to know that default to trust that
 * this write actually lands.
 */
export async function redactOrder(id: number): Promise<Order> {
  assertSafeTarget()

  // See the equivalent comment in findOrders() above — the same `config`, so the same
  // PAYLOAD_LOG_TO_STDERR gating, applies here regardless of call order or `key`.
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

/**
 * Deletes an order row outright. Retention (scripts/prune-orders.ts) is the only caller:
 * a pending or expired order past 30 days is an abandoned checkout with no commercial or
 * legal purpose, so unlike a paid order it is removed rather than redacted.
 *
 * This lives here, next to `redactOrder`, for the reason the whole-branch review gave:
 * deletion is the one irreversible operation of the three, and it was the only one whose
 * guard depended on the caller remembering to call it. `assertSafeTarget()` runs first
 * here too, so the guard now holds by construction on the operation where getting it
 * wrong cannot be undone.
 *
 * `Orders`' collection-level `delete` access is `() => false` — closed to the HTTP and
 * admin paths, not to server-side tooling. `overrideAccess: true` is the same bypass
 * `redactOrder` uses, and is preferable to weakening that access rule.
 */
export async function deleteOrder(id: number): Promise<void> {
  assertSafeTarget()

  // See the equivalent comment in findOrders() above — the same `config`, so the same
  // PAYLOAD_LOG_TO_STDERR gating, applies here regardless of call order or `key`.
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'orders', id, overrideAccess: true })
}

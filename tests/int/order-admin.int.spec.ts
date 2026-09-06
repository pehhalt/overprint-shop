/**
 * Task 10: `src/lib/order-admin.ts` is the shared library Task 11's three scripts
 * (export, erase, prune) build on.
 *
 * Erasure redacts an order rather than deleting the row: `amountTotal`, `status`,
 * `paidAt`, `items` (including `sizeSnapshot`) and `termsAcceptedAt` are a commercial
 * and consent record with their own retention basis and survive. `email`,
 * `shippingName` and the whole `shippingAddress` group are identity — clearing them is
 * what Art. 17 asks for, and the row stays as evidence of the sale.
 *
 * `assertSafeTarget()` reuses `scripts/seed.ts`'s guard shape (the same
 * `extractSupabaseProjectRef`, comparing `DATABASE_URI` against `SEED_DEV_PROJECT_REF`),
 * but does not reuse its ordering defect: `scripts/seed.ts`'s `assertSafeToSeed` checks
 * its override *before* `NODE_ENV`, so a stray `SEED_ALLOW_UNSAFE=1` bypasses the
 * production guard too (recorded in README's Known limitations). Here `NODE_ENV ===
 * 'production'` is checked first, unconditionally, before anything reads
 * `ORDER_ADMIN_ALLOW_UNSAFE` — proven below by setting the override and still expecting
 * a refusal. `findOrders`, `redactOrder` and `deleteOrder` all call the guard as their
 * first statement; the `assertSafeTarget` describe block below proves that directly by
 * pointing the guard's own inputs at a rejectable target and calling each of the three
 * itself, rather than trusting that the guard is still wired in because the rest of the
 * suite passes against the real dev database. `deleteOrder` matters most of the three:
 * it is the only irreversible one.
 *
 * Two fixture orders are used, not one: the redaction test mutates its fixture's email
 * away, so a second, never-redacted fixture backs the lookup test. Both carry every
 * field redaction touches — including `shippingAddress.line2` and
 * `stripePaymentIntentId` — so the redaction test can assert on the ones that are
 * cleared *and* the ones that must survive, not just the ones the fixture happened to
 * leave null already. Both fixtures are created in `beforeAll` and removed in
 * `afterAll` — `dev@overprint.local` and the seeded products are never touched.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { assertSafeTarget, deleteOrder, findOrders, redactOrder } from '@/lib/order-admin'
import { extractSupabaseProjectRef } from '@/lib/supabase-project-ref'

const REDACT_SESSION = 'task10-fixture-cs_test_redact'
const REDACT_EMAIL = 'task10-fixture-redact@overprint.local'
const LOOKUP_SESSION = 'task10-fixture-cs_test_lookup'
const LOOKUP_EMAIL = 'task10-fixture-lookup@overprint.local'
const DELETE_SESSION = 'task10-fixture-cs_test_delete'
const DELETE_EMAIL = 'task10-fixture-delete@overprint.local'

function fixtureOrderPayload(stripeCheckoutSessionId: string, email: string) {
  return {
    stripeCheckoutSessionId,
    stripePaymentIntentId: `pi_${stripeCheckoutSessionId}`,
    email,
    shippingName: 'Task10 Fixture Customer',
    shippingAddress: {
      line1: '1 Fixture Street',
      line2: 'c/o Fixture Care-Of',
      city: 'Fixture City',
      postalCode: '12345',
      country: 'DE',
    },
    status: 'paid' as const,
    fulfilmentStatus: 'unfulfilled' as const,
    amountTotal: 2500,
    paidAt: new Date().toISOString(),
    termsAcceptedAt: new Date().toISOString(),
    items: [
      {
        nameSnapshot: 'Task10 Fixture Shirt',
        unitAmountSnapshot: 2500,
        sizeSnapshot: 'M',
        quantity: 1,
      },
    ],
  }
}

describe('order-admin (Task 10)', () => {
  let payload: Payload
  let redactId: number
  let lookupId: number
  let deleteId: number | undefined

  beforeAll(async () => {
    payload = await getPayload({ config })

    const redactFixture = await payload.create({
      collection: 'orders',
      data: fixtureOrderPayload(REDACT_SESSION, REDACT_EMAIL),
      overrideAccess: true,
    })
    redactId = redactFixture.id

    const lookupFixture = await payload.create({
      collection: 'orders',
      data: fixtureOrderPayload(LOOKUP_SESSION, LOOKUP_EMAIL),
      overrideAccess: true,
    })
    lookupId = lookupFixture.id
  })

  afterAll(async () => {
    for (const id of [redactId, lookupId, deleteId]) {
      if (id === undefined) continue
      await payload.delete({ collection: 'orders', id, overrideAccess: true }).catch(() => {})
    }
  })

  it('deletes an order outright, for retention', async () => {
    // Its own fixture, created here rather than in `beforeAll`: this is the one test
    // whose subject is gone by the time it finishes, so it can't share one. `deleteId`
    // is still recorded so `afterAll` cleans up if the delete is what failed.
    const doomed = await payload.create({
      collection: 'orders',
      data: fixtureOrderPayload(DELETE_SESSION, DELETE_EMAIL),
      overrideAccess: true,
    })
    deleteId = doomed.id

    await deleteOrder(doomed.id)

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: DELETE_SESSION } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
    deleteId = undefined
  })

  it('redacts identity and keeps the transactional record', async () => {
    const before = await payload.findByID({ collection: 'orders', id: redactId, overrideAccess: true })

    await redactOrder(redactId)

    const after = await payload.findByID({ collection: 'orders', id: redactId, overrideAccess: true })

    expect(after.email).toBeFalsy()
    expect(after.shippingName).toBeFalsy()
    expect(after.shippingAddress?.line1).toBeFalsy()
    expect(after.shippingAddress?.line2).toBeFalsy()
    expect(after.shippingAddress?.city).toBeFalsy()
    expect(after.shippingAddress?.postalCode).toBeFalsy()
    expect(after.shippingAddress?.country).toBeFalsy()

    expect(after.amountTotal).toBe(before.amountTotal)
    expect(after.status).toBe(before.status)
    expect(after.paidAt).toBe(before.paidAt)
    expect(after.termsAcceptedAt).toBe(before.termsAcceptedAt)
    expect(after.stripeCheckoutSessionId).toBe(before.stripeCheckoutSessionId)
    expect(after.stripePaymentIntentId).toBe(before.stripePaymentIntentId)
    expect(after.items[0].sizeSnapshot).toBe(before.items[0].sizeSnapshot)
    expect(after.items[0].nameSnapshot).toBe(before.items[0].nameSnapshot)
    expect(after.items[0].unitAmountSnapshot).toBe(before.items[0].unitAmountSnapshot)
  })

  it('finds orders by email and by session id', async () => {
    expect((await findOrders({ email: LOOKUP_EMAIL }))[0].id).toBe(lookupId)
    expect((await findOrders({ sessionId: LOOKUP_SESSION }))[0].id).toBe(lookupId)
  })

  it('finds nothing for an email or session id that matches no order', async () => {
    expect(await findOrders({ email: 'no-such-fixture@overprint.local' })).toEqual([])
    expect(await findOrders({ sessionId: 'cs_test_does_not_exist' })).toEqual([])
  })

  it('refuses a lookup with neither an email nor a session id', async () => {
    await expect(findOrders({})).rejects.toThrow()
  })
})

describe('extractSupabaseProjectRef (shared with scripts/seed.ts)', () => {
  it('reads the ref from a pooler connection string', () => {
    expect(
      extractSupabaseProjectRef('postgresql://postgres.abc123:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'),
    ).toBe('abc123')
  })

  it('reads the ref from a direct connection string', () => {
    expect(extractSupabaseProjectRef('postgresql://postgres:pw@db.abc123.supabase.co:5432/postgres')).toBe('abc123')
  })

  it('returns null for an unrecognisable connection string', () => {
    expect(extractSupabaseProjectRef('postgresql://someone:pw@example.com:5432/postgres')).toBeNull()
  })
})

describe('assertSafeTarget', () => {
  // NODE_ENV is typed read-only on process.env (Next.js's ambient types) — this is the
  // one place in the suite that deliberately overrides it, so it goes through a cast
  // rather than loosening the ambient type project-wide.
  const env = process.env as Record<string, string | undefined>
  const ENV_KEYS = ['NODE_ENV', 'DATABASE_URI', 'SEED_DEV_PROJECT_REF', 'ORDER_ADMIN_ALLOW_UNSAFE'] as const
  let snapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

  // Saved before every test (not just the ones that mutate env), so a future test added
  // without remembering to snapshot still restores correctly instead of inheriting —
  // and then handing the next test — whatever the previous test left behind.
  beforeEach(() => {
    snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]))
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete env[key]
      else env[key] = snapshot[key]
    }
  })

  // Own fixture, separate from the Task 10 describe above: that block's `payload`,
  // `redactId` and `lookupId` are scoped to its own callback and one of them is redacted
  // by the time its tests finish, so neither is reusable here to prove a write never
  // landed.
  const GUARD_SESSION = 'task11-fixture-cs_test_guard'
  const GUARD_EMAIL = 'task11-fixture-guard@overprint.local'
  let guardPayload: Payload
  let guardOrderId: number

  beforeAll(async () => {
    guardPayload = await getPayload({ config })
    const fixture = await guardPayload.create({
      collection: 'orders',
      data: fixtureOrderPayload(GUARD_SESSION, GUARD_EMAIL),
      overrideAccess: true,
    })
    guardOrderId = fixture.id
  })

  afterAll(async () => {
    // Unlike the Task 10 describe block's afterAll above, a failed cleanup here is
    // surfaced rather than swallowed: it's cheap, and a silently orphaned
    // `task11-fixture-*` row in the shared dev database is otherwise invisible.
    await guardPayload.delete({ collection: 'orders', id: guardOrderId, overrideAccess: true }).catch((error) => {
      console.warn(`Failed to clean up guard fixture order #${guardOrderId}: ${error}`)
    })
  })

  it('does not throw against the real development target', () => {
    expect(() => assertSafeTarget()).not.toThrow()
  })

  it('refuses when NODE_ENV is production, even with the override set', () => {
    env.NODE_ENV = 'production'
    env.ORDER_ADMIN_ALLOW_UNSAFE = '1'
    expect(() => assertSafeTarget()).toThrow(/production/i)
  })

  it('refuses when DATABASE_URI is not set', () => {
    delete env.DATABASE_URI
    expect(() => assertSafeTarget()).toThrow(/DATABASE_URI/)
  })

  it('refuses when SEED_DEV_PROJECT_REF is not set', () => {
    delete env.SEED_DEV_PROJECT_REF
    expect(() => assertSafeTarget()).toThrow(/SEED_DEV_PROJECT_REF/)
  })

  it('refuses when the project ref does not match', () => {
    env.SEED_DEV_PROJECT_REF = 'some-other-project-ref'
    expect(() => assertSafeTarget()).toThrow(/does not match/)
  })

  it('lets the override rescue a project-ref mismatch outside production', () => {
    env.SEED_DEV_PROJECT_REF = 'some-other-project-ref'
    env.ORDER_ADMIN_ALLOW_UNSAFE = '1'
    expect(() => assertSafeTarget()).not.toThrow()
  })

  // Task 10's review found that only a deleted throwaway script had ever proven the
  // *internal* assertSafeTarget() calls inside findOrders/redactOrder — no committed test
  // called them against a bad target. A regression that removed those internal calls
  // would leave the rest of this suite green, since every other test here runs against the
  // real, valid dev target. These two point the guard's own inputs at a rejectable target
  // and call the exported functions directly, so a stripped-out internal call fails here.
  // Unlike its sibling below, this can't also assert "nothing was read": findOrders is a
  // pure read with no side effect to inspect afterward. The promise rejecting before
  // resolving to any rows is the entire observable proof that the query never ran.
  it('refuses findOrders against a target the guard must reject', async () => {
    env.SEED_DEV_PROJECT_REF = 'some-other-project-ref'
    await expect(findOrders({ email: GUARD_EMAIL })).rejects.toThrow(/does not match/)
  })

  it('refuses redactOrder against a target the guard must reject, before it can write', async () => {
    env.SEED_DEV_PROJECT_REF = 'some-other-project-ref'
    await expect(redactOrder(guardOrderId)).rejects.toThrow(/does not match/)

    const stillIntact = await guardPayload.findByID({ collection: 'orders', id: guardOrderId, overrideAccess: true })
    expect(stillIntact.email).toBe(GUARD_EMAIL)
  })

  // The whole-branch review's Important 4: deletion is the only one of the three that
  // cannot be undone, and until now it was the only one whose guard lived solely at
  // prune-orders.ts's call site. This is the same test as the redaction one above, on
  // the operation where a missing guard costs the row rather than a field.
  it('refuses deleteOrder against a target the guard must reject, before it can delete', async () => {
    env.SEED_DEV_PROJECT_REF = 'some-other-project-ref'
    await expect(deleteOrder(guardOrderId)).rejects.toThrow(/does not match/)

    const stillThere = await guardPayload.findByID({ collection: 'orders', id: guardOrderId, overrideAccess: true })
    expect(stillThere.id).toBe(guardOrderId)
  })
})

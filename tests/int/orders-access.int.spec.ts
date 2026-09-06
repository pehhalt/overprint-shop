/**
 * Task 9: Orders is the point at which real money changes hands, so the access
 * rule is deliberately absolute — `create`, `update` and `delete` are all
 * `() => false` in `src/collections/Orders.ts`. The only writer is the Stripe
 * webhook handler (a later task), running server-side through Payload's Local
 * API with `overrideAccess: true`.
 *
 * "Closed to the API" has two halves, and proving only one of them is not
 * enough:
 *   1. An unauthenticated REST POST to /api/orders must be refused.
 *   2. An *authenticated* REST POST — a real admin, logged in — must be
 *      refused too. If only (1) were true, an admin session (or a leaked
 *      admin cookie) could still forge paid orders over HTTP.
 *   3. The Local API, called with `overrideAccess: true`, must still succeed
 *      — otherwise the webhook handler this collection exists for would be
 *      unable to write anything either, and "closed to the API" would really
 *      mean "closed, full stop".
 *
 * These tests call the generated Next.js route handler
 * (`src/app/(payload)/api/[...slug]/route.ts`) directly with a constructed
 * Fetch `Request`, which exercises the real REST access-control path without
 * needing a running `next dev` server. A fixture admin user is created for
 * the authenticated case and removed in `afterAll` — `dev@overprint.local`
 * and the seeded products are never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { POST as ordersApiPost } from '@/app/(payload)/api/[...slug]/route'

const FIXTURE_SESSION_ID_REST_ANON = 'task9-fixture-cs_test_rest_anon'
const FIXTURE_SESSION_ID_REST_AUTH = 'task9-fixture-cs_test_rest_auth'
const FIXTURE_SESSION_ID_LOCAL_OVERRIDE = 'task9-fixture-cs_test_local_override'
const FIXTURE_SESSION_ID_LOCAL_NO_OVERRIDE = 'task9-fixture-cs_test_local_no_override'
const FIXTURE_ADMIN_EMAIL = 'task9-fixture-admin@overprint.local'
const FIXTURE_ADMIN_PASSWORD = 'task9-fixture-password-CHANGE-ME-123!'

function fixtureOrderPayload(stripeCheckoutSessionId: string) {
  return {
    stripeCheckoutSessionId,
    // `status` has a `defaultValue` in the collection config, but Payload's
    // generated create-data type still requires it explicitly — it's marked
    // `required: true` with no `?` on the field, so the default only fills
    // in at the database layer, not in the Local API's TypeScript surface.
    status: 'pending' as const,
    amountTotal: 2500,
    items: [
      {
        nameSnapshot: 'Task9 Fixture Shirt',
        unitAmountSnapshot: 2500,
        sizeSnapshot: 'M',
        quantity: 1,
      },
    ],
  }
}

async function postOrderOverRest(body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `JWT ${token}`
  }

  const request = new Request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  return ordersApiPost(request, { params: Promise.resolve({ slug: ['orders'] }) })
}

describe('Orders access control (Task 9)', () => {
  let payload: Payload
  let adminId: number
  let adminToken: string

  beforeAll(async () => {
    payload = await getPayload({ config })

    const admin = await payload.create({
      collection: 'users',
      data: { email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD },
    })
    adminId = admin.id

    const loginResult = await payload.login({
      collection: 'users',
      data: { email: FIXTURE_ADMIN_EMAIL, password: FIXTURE_ADMIN_PASSWORD },
    })
    if (!loginResult.token) {
      throw new Error('Fixture admin login did not return a token.')
    }
    adminToken = loginResult.token
  })

  afterAll(async () => {
    const remainingOrders = await payload.find({
      collection: 'orders',
      where: {
        stripeCheckoutSessionId: {
          in: [
            FIXTURE_SESSION_ID_REST_ANON,
            FIXTURE_SESSION_ID_REST_AUTH,
            FIXTURE_SESSION_ID_LOCAL_OVERRIDE,
            FIXTURE_SESSION_ID_LOCAL_NO_OVERRIDE,
          ],
        },
      },
      limit: 10,
      overrideAccess: true,
    })
    for (const doc of remainingOrders.docs) {
      await payload.delete({ collection: 'orders', id: doc.id, overrideAccess: true }).catch(() => {})
    }

    await payload.delete({ collection: 'users', id: adminId }).catch(() => {})
  })

  it('refuses an unauthenticated REST create', async () => {
    const response = await postOrderOverRest(fixtureOrderPayload(FIXTURE_SESSION_ID_REST_ANON))

    expect([401, 403]).toContain(response.status)

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: FIXTURE_SESSION_ID_REST_ANON } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
  })

  it('refuses an authenticated (logged-in admin) REST create', async () => {
    const response = await postOrderOverRest(
      fixtureOrderPayload(FIXTURE_SESSION_ID_REST_AUTH),
      adminToken,
    )

    expect(response.status).toBe(403)

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: FIXTURE_SESSION_ID_REST_AUTH } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
  })

  it('still allows a create through the Local API with overrideAccess: true', async () => {
    const created = await payload.create({
      collection: 'orders',
      data: fixtureOrderPayload(FIXTURE_SESSION_ID_LOCAL_OVERRIDE),
      overrideAccess: true,
    })

    expect(created.stripeCheckoutSessionId).toBe(FIXTURE_SESSION_ID_LOCAL_OVERRIDE)

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: FIXTURE_SESSION_ID_LOCAL_OVERRIDE } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(1)
  })

  it('refuses a create through the Local API with overrideAccess explicitly disabled', async () => {
    // Payload's Local API defaults `overrideAccess` to `true` — it bypasses
    // access control unless told otherwise. So the interesting negative case
    // isn't "the default", it's access control actually being enforced:
    // passing `overrideAccess: false` must still route through the same
    // `create: () => false` rule the REST tests above hit.
    await expect(
      payload.create({
        collection: 'orders',
        data: fixtureOrderPayload(FIXTURE_SESSION_ID_LOCAL_NO_OVERRIDE),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const found = await payload.find({
      collection: 'orders',
      where: { stripeCheckoutSessionId: { equals: FIXTURE_SESSION_ID_LOCAL_NO_OVERRIDE } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
  })
})

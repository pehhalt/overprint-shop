/**
 * Task 9: Orders is the point at which real money changes hands, so `create`
 * and `delete` are absolute `() => false` in `src/collections/Orders.ts`.
 * `update` is open to a logged-in owner for one purpose only — marking an
 * order shipped — and every money, identity and consent field closes itself
 * individually with field-level `access.update`. The only writer of those
 * fields is the Stripe webhook handler, running server-side through Payload's
 * Local API with `overrideAccess: true`.
 *
 * "Closed to the API" has several halves, and proving only one of them is not
 * enough:
 *   1. An unauthenticated REST POST to /api/orders must be refused.
 *   2. An *authenticated* REST POST — a real admin, logged in — must be
 *      refused too. If only (1) were true, an admin session (or a leaked
 *      admin cookie) could still forge paid orders over HTTP.
 *   3. The Local API, called with `overrideAccess: true`, must still succeed
 *      — otherwise the webhook handler this collection exists for would be
 *      unable to write anything either, and "closed to the API" would really
 *      mean "closed, full stop".
 *   4. Now that `update` is open, that same logged-in admin must still be
 *      unable to move `status` to `paid`, or to touch `paidAt` or
 *      `amountTotal`, over REST.
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
import { PATCH as ordersApiPatch, POST as ordersApiPost } from '@/app/(payload)/api/[...slug]/route'

const FIXTURE_SESSION_ID_REST_ANON = 'task9-fixture-cs_test_rest_anon'
const FIXTURE_SESSION_ID_REST_AUTH = 'task9-fixture-cs_test_rest_auth'
const FIXTURE_SESSION_ID_LOCAL_OVERRIDE = 'task9-fixture-cs_test_local_override'
const FIXTURE_SESSION_ID_LOCAL_NO_OVERRIDE = 'task9-fixture-cs_test_local_no_override'
const FIXTURE_SESSION_ID_UPDATE = 'task9-fixture-cs_test_field_level_update'
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
    fulfilmentStatus: 'unfulfilled' as const,
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

async function patchOrderOverRest(id: number, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `JWT ${token}`
  }

  const request = new Request(`http://localhost:3000/api/orders/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })

  return ordersApiPatch(request, { params: Promise.resolve({ slug: ['orders', String(id)] }) })
}

describe('Orders access control (Task 9)', () => {
  let payload: Payload
  let adminId: number
  let adminToken: string
  let updatableOrderId: number

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

    // The tests above all assert that writes are refused, so none of them
    // leaves an order behind. The field-level update tests need one to edit.
    const updatable = await payload.create({
      collection: 'orders',
      data: fixtureOrderPayload(FIXTURE_SESSION_ID_UPDATE),
      overrideAccess: true,
    })
    updatableOrderId = updatable.id
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
            FIXTURE_SESSION_ID_UPDATE,
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

  it('lets a logged-in admin change fulfilmentStatus over REST', async () => {
    const response = await patchOrderOverRest(
      updatableOrderId,
      { fulfilmentStatus: 'shipped' },
      adminToken,
    )
    expect(response.status).toBe(200)

    const order = await payload.findByID({
      collection: 'orders',
      id: updatableOrderId,
      overrideAccess: true,
    })
    expect(order.fulfilmentStatus).toBe('shipped')
    expect(order.fulfilledAt).toBeTruthy()
  })

  it('refuses that same admin changing status, paidAt or amountTotal', async () => {
    const before = await payload.findByID({
      collection: 'orders',
      id: updatableOrderId,
      overrideAccess: true,
    })

    await patchOrderOverRest(
      updatableOrderId,
      { status: 'paid', paidAt: new Date().toISOString(), amountTotal: 1 },
      adminToken,
    )

    const after = await payload.findByID({
      collection: 'orders',
      id: updatableOrderId,
      overrideAccess: true,
    })
    expect(after.status).toBe(before.status)
    expect(after.paidAt).toBe(before.paidAt)
    expect(after.amountTotal).toBe(before.amountTotal)
  })

  it('still refuses an unauthenticated update', async () => {
    const response = await patchOrderOverRest(updatableOrderId, { fulfilmentStatus: 'shipped' })
    expect([401, 403]).toContain(response.status)
  })

  it('still lets the server write the closed fields through the Local API', async () => {
    const paidAt = new Date().toISOString()
    await payload.update({
      collection: 'orders',
      id: updatableOrderId,
      overrideAccess: true,
      data: { status: 'paid', paidAt },
    })

    const order = await payload.findByID({
      collection: 'orders',
      id: updatableOrderId,
      overrideAccess: true,
    })
    expect(order.status).toBe('paid')
  })
})

/**
 * Retention (design doc §12): pending/expired orders are deleted after 30 days — they
 * accumulate on every abandoned checkout and have no commercial or legal purpose. Paid
 * orders are redacted, not deleted, after 2 years, by the same routine as erase-order.ts.
 * Age is measured from `createdAt`, which every order has; `paidAt` would be near-identical
 * for a paid order in practice but isn't set on the pending/expired ones this also prunes.
 *
 * Deleting is the one thing src/lib/order-admin.ts doesn't provide: `Orders`' collection-level
 * `delete` access is `() => false`. This calls the Local API directly with
 * `overrideAccess: true`, the same bypass redactOrder() already uses, rather than weakening
 * that access rule.
 *
 * Without --confirm this only prints the plan and writes nothing. Run with:
 *
 *   npm run prune:orders                  (dry run)
 *   npm run prune:orders -- --confirm     (deletes/redacts)
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { assertSafeTarget, redactOrder } from '@/lib/order-admin'
import { hasConfirm, refuse } from './lib/order-admin-cli'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

async function main() {
  try {
    assertSafeTarget()
  } catch (error) {
    refuse(error)
  }

  const confirm = hasConfirm(process.argv.slice(2))
  const now = Date.now()
  const payload = await getPayload({ config })

  const { docs: staleUnpaid } = await payload.find({
    collection: 'orders',
    where: {
      and: [
        { status: { in: ['pending', 'expired'] } },
        { createdAt: { less_than: new Date(now - THIRTY_DAYS_MS).toISOString() } },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  const { docs: stalePaid } = await payload.find({
    collection: 'orders',
    where: {
      and: [{ status: { equals: 'paid' } }, { createdAt: { less_than: new Date(now - TWO_YEARS_MS).toISOString() } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })

  console.log(`Plan: delete ${staleUnpaid.length} pending/expired order(s) older than 30 days.`)
  for (const order of staleUnpaid) console.log(`  delete #${order.id} status=${order.status} created=${order.createdAt}`)

  console.log(`Plan: redact ${stalePaid.length} paid order(s) older than 2 years.`)
  for (const order of stalePaid) console.log(`  redact #${order.id} created=${order.createdAt}`)

  if (!confirm) {
    console.log('Dry run: nothing was written. Pass --confirm to apply the plan above.')
    process.exit(0)
  }

  for (const order of staleUnpaid) {
    await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
    console.log(`Deleted #${order.id}.`)
  }

  for (const order of stalePaid) {
    await redactOrder(order.id)
    console.log(`Redacted #${order.id}.`)
  }

  console.log('Prune complete.')
  process.exit(0)
}

main().catch(refuse)

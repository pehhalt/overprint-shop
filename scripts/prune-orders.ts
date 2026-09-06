/**
 * Retention (design doc §12): pending/expired orders are deleted after 30 days — they
 * accumulate on every abandoned checkout and have no commercial or legal purpose. Paid
 * orders are redacted, not deleted, after 2 years, by the same routine as erase-order.ts.
 *
 * Age is measured from `createdAt` for both, not `paidAt`, even for paid orders:
 * `paid_at` is nullable in the schema (src/migrations/20260905_211217_orders.ts) while
 * `created_at` is `NOT NULL`. A `paidAt`-based query would permanently skip any `paid`
 * row that somehow has a null `paidAt` — an unbounded retention leak, strictly worse than
 * redacting a `createdAt`-anchored row up to a day or so earlier than a strict payment-date
 * reading of "2 years" would.
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
import { assertSafeTarget, redactOrder } from '@/lib/order-admin'
import { assertKnownFlags, exitAfterWrite, hasConfirm, initPayloadForScript, refuse } from './lib/order-admin-cli'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000

async function main() {
  const argv = process.argv.slice(2)
  // No --email/--session: unlike its siblings, prune-orders.ts isn't scoped to one
  // subject — it acts on every stale order in the database. Fix round 2 found that
  // passing one of the sibling scripts' flags here (a natural mistake, since all three
  // share a package.json section) was silently ignored rather than refused, so an
  // operator who assumed prune scoped the way erase does could prune the whole database.
  assertKnownFlags(argv, ['--confirm'])

  try {
    assertSafeTarget()
  } catch (error) {
    refuse(error)
  }

  const confirm = hasConfirm(argv)
  const now = Date.now()
  const payload = await initPayloadForScript()

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
    await exitAfterWrite(process.stdout, 'Dry run: nothing was written. Pass --confirm to apply the plan above.\n', 0)
    return
  }

  // Once this loop starts, a thrown error no longer means nothing happened — reported
  // separately from refuse() below, with a count of what already committed, so an
  // operator can't read "Refused" and assume none of the deletions/redactions above
  // actually landed.
  let deletedCount = 0
  let redactedCount = 0
  try {
    for (const order of staleUnpaid) {
      await payload.delete({ collection: 'orders', id: order.id, overrideAccess: true })
      deletedCount++
      console.log(`Deleted #${order.id}.`)
    }

    for (const order of stalePaid) {
      await redactOrder(order.id)
      redactedCount++
      console.log(`Redacted #${order.id}.`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await exitAfterWrite(
      process.stderr,
      `Failed partway through pruning — ${deletedCount}/${staleUnpaid.length} deletion(s) and ` +
        `${redactedCount}/${stalePaid.length} redaction(s) already committed before this error: ${message}\n`,
      1,
    )
    return
  }

  await exitAfterWrite(process.stdout, 'Prune complete.\n', 0)
}

main().catch(refuse)

/**
 * GDPR Art. 17 (erasure): redacts every order matching an email or a Stripe Checkout
 * Session id — see redactOrder() in src/lib/order-admin.ts for exactly what is cleared
 * and what survives.
 *
 * Without --confirm this only prints what it would redact and writes nothing, so a
 * lookup can be checked before it's acted on. Run with:
 *
 *   npm run erase:order -- --email someone@example.com           (dry run)
 *   npm run erase:order -- --email someone@example.com --confirm (redacts)
 */
import 'dotenv/config'
import { assertSafeTarget, findOrders, redactOrder } from '@/lib/order-admin'
import {
  assertKnownFlags,
  describeTarget,
  exitAfterWrite,
  hasConfirm,
  initPayloadForScript,
  parseTarget,
  refuse,
} from './lib/order-admin-cli'

async function main() {
  const argv = process.argv.slice(2)
  assertKnownFlags(argv, ['--email', '--session', '--confirm'])
  const target = parseTarget(argv)

  try {
    assertSafeTarget()
  } catch (error) {
    refuse(error)
  }

  // Must run before findOrders()'s own getPayload({ config }) call — see
  // initPayloadForScript()'s doc comment for why that ordering is what redirects
  // Payload's logger away from stdout.
  await initPayloadForScript()

  const orders = await findOrders(target)

  if (orders.length === 0) {
    await exitAfterWrite(process.stdout, `No orders found matching ${describeTarget(target)}. Nothing to erase.\n`, 0)
    return
  }

  console.log(`Plan: redact ${orders.length} order(s) matching ${describeTarget(target)}:`)
  for (const order of orders) {
    console.log(`  #${order.id} session=${order.stripeCheckoutSessionId} email=${order.email ?? '(already redacted)'}`)
  }

  if (!hasConfirm(argv)) {
    await exitAfterWrite(process.stdout, 'Dry run: nothing was written. Pass --confirm to redact the order(s) above.\n', 0)
    return
  }

  // Once this loop starts, a thrown error no longer means nothing happened — reported
  // separately from refuse() below so an operator can't read "Refused" and assume the
  // orders logged before the failure weren't actually redacted.
  let redactedCount = 0
  try {
    for (const order of orders) {
      await redactOrder(order.id)
      redactedCount++
      console.log(`Redacted #${order.id}.`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await exitAfterWrite(
      process.stderr,
      `Failed partway through erasure — ${redactedCount}/${orders.length} order(s) already redacted before this error: ${message}\n`,
      1,
    )
    return
  }

  await exitAfterWrite(process.stdout, 'Erasure complete.\n', 0)
}

main().catch(refuse)

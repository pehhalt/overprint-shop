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
import { describeTarget, hasConfirm, parseTarget, refuse } from './lib/order-admin-cli'

async function main() {
  const argv = process.argv.slice(2)
  const target = parseTarget(argv)

  try {
    assertSafeTarget()
  } catch (error) {
    refuse(error)
  }

  const orders = await findOrders(target)

  if (orders.length === 0) {
    console.log(`No orders found matching ${describeTarget(target)}. Nothing to erase.`)
    process.exit(0)
  }

  console.log(`Plan: redact ${orders.length} order(s) matching ${describeTarget(target)}:`)
  for (const order of orders) {
    console.log(`  #${order.id} session=${order.stripeCheckoutSessionId} email=${order.email ?? '(already redacted)'}`)
  }

  if (!hasConfirm(argv)) {
    console.log('Dry run: nothing was written. Pass --confirm to redact the order(s) above.')
    process.exit(0)
  }

  for (const order of orders) {
    await redactOrder(order.id)
    console.log(`Redacted #${order.id}.`)
  }

  console.log('Erasure complete.')
  process.exit(0)
}

main().catch(refuse)

/**
 * GDPR Art. 15 (access) and Art. 20 (portability): writes every order matching an email
 * or a Stripe Checkout Session id to stdout as JSON. Read-only — this script never calls
 * redactOrder or payload.delete.
 *
 * stdout carries only the JSON result, so it can be piped or redirected straight to a
 * file; every human-readable status line goes to stderr instead.
 *
 * Run with:  npm run export:order -- --email someone@example.com
 *       or:  npm run export:order -- --session cs_test_...
 */
import 'dotenv/config'
import { assertSafeTarget, findOrders } from '@/lib/order-admin'
import { describeTarget, parseTarget, refuse } from './lib/order-admin-cli'

async function main() {
  const target = parseTarget(process.argv.slice(2))

  try {
    assertSafeTarget()
  } catch (error) {
    refuse(error)
  }

  console.error(`Looking up orders matching ${describeTarget(target)}...`)

  const orders = await findOrders(target)

  console.error(`Found ${orders.length} order(s). Writing JSON to stdout.`)

  console.log(JSON.stringify(orders, null, 2))
  process.exit(0)
}

main().catch(refuse)

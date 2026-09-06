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
import { assertKnownFlags, describeTarget, exitAfterWrite, initPayloadForScript, parseTarget, refuse } from './lib/order-admin-cli'

async function main() {
  const argv = process.argv.slice(2)
  assertKnownFlags(argv, ['--email', '--session'])
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

  console.error(`Looking up orders matching ${describeTarget(target)}...`)

  const orders = await findOrders(target)

  console.error(`Found ${orders.length} order(s). Writing JSON to stdout.`)

  // exitAfterWrite, not console.log + process.exit: this is the payload the whole script
  // exists to deliver, and it has no upper bound on size — a subject with enough orders
  // to exceed the stdout buffer must not come back truncated with a silent exit 0.
  await exitAfterWrite(process.stdout, JSON.stringify(orders, null, 2) + '\n', 0)
}

main().catch(refuse)

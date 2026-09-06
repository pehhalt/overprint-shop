/**
 * The three order-data scripts had no tests of their own: `src/lib/order-admin.ts` was
 * covered, but nothing ever ran `scripts/erase-order.ts` or `scripts/prune-orders.ts` as
 * a process. Everything that makes them safe to hand an operator — the dry-run default,
 * and refusing an argument shape they don't take — lives in the script layer, above the
 * library, so a library test cannot reach it.
 *
 * Both cases here are about a write that must not happen:
 *   1. `erase:order --email <x>` without `--confirm` must leave the order untouched. The
 *      dry run is the only thing standing between "check who this lookup matches" and
 *      "redact them".
 *   2. `prune:orders -- someone@example.com --confirm` must be refused. `prune:orders`
 *      is the one script with no target — it acts on every stale order — so an operator
 *      who assumes it scopes the way its two siblings do, and passes an email, must be
 *      stopped rather than have the argument quietly dropped while `--confirm` lands.
 *
 * The scripts are spawned through `tsx` with `PAYLOAD_LOG_TO_STDERR=1`, which is exactly
 * what their npm scripts expand to, minus npm's own shim — running them through `npm run`
 * would test npm's Windows shim more than it tests these scripts.
 *
 * A real fixture order is created for case 1 and removed afterwards. Nothing here touches
 * `dev@overprint.local` or the seeded products; case 2's assertion is that nothing was
 * written at all.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TSX_CLI = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url))

const ERASE_SESSION = 'script-fixture-cs_test_erase_dry_run'
const ERASE_EMAIL = 'script-fixture-erase@overprint.local'

type ScriptResult = { code: number | null; stdout: string; stderr: string }

function runScript(script: string, args: string[]): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, script, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, PAYLOAD_LOG_TO_STDERR: '1' },
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('order-data scripts', () => {
  let payload: Payload
  let eraseOrderId: number

  beforeAll(async () => {
    payload = await getPayload({ config })
    const fixture = await payload.create({
      collection: 'orders',
      data: {
        stripeCheckoutSessionId: ERASE_SESSION,
        email: ERASE_EMAIL,
        shippingName: 'Script Fixture Customer',
        shippingAddress: {
          line1: '1 Fixture Street',
          line2: null,
          city: 'Fixture City',
          postalCode: '12345',
          country: 'DE',
        },
        status: 'paid' as const,
        fulfilmentStatus: 'unfulfilled' as const,
        amountTotal: 2500,
        paidAt: new Date().toISOString(),
        items: [
          { nameSnapshot: 'Script Fixture Shirt', unitAmountSnapshot: 2500, sizeSnapshot: 'M', quantity: 1 },
        ],
      },
      overrideAccess: true,
    })
    eraseOrderId = fixture.id
  })

  afterAll(async () => {
    await payload.delete({ collection: 'orders', id: eraseOrderId, overrideAccess: true }).catch(() => {})
  })

  it('erase:order without --confirm redacts nothing', async () => {
    const result = await runScript('scripts/erase-order.ts', ['--email', ERASE_EMAIL])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`Plan: redact 1 order(s)`)
    expect(result.stdout).toContain('Dry run: nothing was written.')

    const after = await payload.findByID({ collection: 'orders', id: eraseOrderId, overrideAccess: true })
    expect(after.email).toBe(ERASE_EMAIL)
    expect(after.shippingName).toBe('Script Fixture Customer')
    expect(after.shippingAddress?.line1).toBe('1 Fixture Street')
  }, 120_000)

  it('prune:orders refuses a target argument it does not take, rather than pruning everything', async () => {
    const result = await runScript('scripts/prune-orders.ts', ['someone@example.com', '--confirm'])

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Refused: .*someone@example\.com/)
    // The refusal has to land before the plan, not after it: nothing may have run.
    expect(result.stdout).not.toContain('Plan:')
    expect(result.stdout).not.toContain('Prune complete.')
  }, 120_000)
})

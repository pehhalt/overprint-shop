/**
 * Argument parsing, Payload init, output-flushing and a refusal helper shared by
 * export-order.ts, erase-order.ts and prune-orders.ts. Three flags across three scripts
 * don't earn a CLI framework — this is the whole shared surface.
 */
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'

export type Target = { email?: string; sessionId?: string }

function readFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const idx = argv.indexOf(`--${name}`)
  return idx === -1 ? undefined : argv[idx + 1]
}

/** export-order.ts and erase-order.ts both identify their target this way; prune-orders.ts doesn't take one. */
export function parseTarget(argv: string[]): Target {
  const email = readFlag(argv, 'email')
  const sessionId = readFlag(argv, 'session')
  if (!email && !sessionId) {
    throw new Error('Usage: --email <address> or --session <Stripe Checkout Session id>')
  }
  return { email, sessionId }
}

export function describeTarget(target: Target): string {
  return [target.email && `email=${target.email}`, target.sessionId && `session=${target.sessionId}`]
    .filter(Boolean)
    .join(', ')
}

export function hasConfirm(argv: string[]): boolean {
  return argv.includes('--confirm')
}

/**
 * Fix round 2: prune-orders.ts used to read only `--confirm` and silently discard
 * everything else, so `--email someone@example.com --confirm` — a shape that looks
 * exactly like erase-order.ts's real syntax — pruned the whole database instead of
 * refusing an argument prune-orders.ts doesn't accept. Each script now declares the
 * flags it recognises and this rejects any other `--`-prefixed argument before doing
 * anything else, in all three scripts, so the same mistake against export/erase fails
 * the same way rather than being silently ignored there too.
 */
export function assertKnownFlags(argv: string[], allowed: readonly string[]): void {
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue // a flag's value (e.g. the email after `--email`), not a flag itself
    const name = arg.split('=')[0]
    if (!allowed.includes(name)) {
      throw new Error(`Unrecognised argument: ${name}. This script accepts: ${allowed.join(', ')}`)
    }
  }
}

/**
 * Fix round 2: redirecting a real export to a file and parsing it (the large-export proof
 * in task-11-report.md) found that Payload's default pino logger writes its own
 * startup/runtime log lines (e.g. "No email adapter provided") directly to
 * `process.stdout` — bypassing this project's own console.error-for-status-lines
 * discipline entirely, since that log line never goes through our console.* calls at
 * all. export-order.ts's stdout is meant to be pure JSON; that line, when present,
 * corrupts a piped or redirected export into invalid JSON. No earlier proof caught it
 * because they all read a terminal that mixes stdout and stderr together.
 *
 * getPayload() caches its instance by `key` only (default `'default'`) and, once
 * cached, ignores the `config` argument on every later call in the same process — so
 * calling this first, before findOrders()/redactOrder() get a chance to call the plain
 * `getPayload({ config })` with Payload's un-redirected default logger, makes every
 * later call in the process reuse this instance instead.
 */
export async function initPayloadForScript(): Promise<Payload> {
  const resolvedConfig = await config
  // `{ destination, options: {} }` is a valid pino logger config (every option is
  // optional) but doesn't match the much narrower literal type TS inferred for this
  // project's own config value — a cast through `unknown`, not a loosening of a type
  // that's meaningfully constraining anything here.
  const logger = { destination: process.stderr, options: {} } as unknown as (typeof resolvedConfig)['logger']
  return getPayload({ config: { ...resolvedConfig, logger } })
}

/**
 * Fix round 2: `process.stdout`/`process.stderr` are asynchronous to a pipe on every OS
 * and to a file on Windows (this project's platform) — `stream.write()` can still be
 * buffering when the next line runs. `process.exit()` does not wait for that buffer to
 * drain, so a script that logged its result and then called `process.exit()` immediately
 * could truncate output larger than the OS pipe/file buffer, silently, with exit 0. Each
 * script still needs an explicit exit afterward — Payload's pg pool keeps the event loop
 * open, so without one the process just hangs — but only once the write's own callback
 * confirms it actually landed.
 */
export function exitAfterWrite(stream: NodeJS.WritableStream, text: string, code: number): Promise<never> {
  return new Promise((_, reject) => {
    stream.write(text, (error) => {
      if (error) reject(error)
      else process.exit(code)
    })
  })
}

/**
 * Turns a thrown Error (from assertSafeTarget, argument parsing, or anything else before
 * a script's write loop has started) into a message and a non-zero exit, never a raw
 * stack trace. Not used once a write loop has begun — see the `catch` around each
 * write loop in erase-order.ts/prune-orders.ts, which reports a partial-completion count
 * instead: "Refused" would misleadingly claim nothing happened.
 */
export function refuse(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Refused: ${message}`)
  // Short, single-line message — well under any pipe/file buffer, so exiting right after
  // logging it (rather than going through exitAfterWrite) doesn't risk truncation.
  process.exit(1)
}

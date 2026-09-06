/**
 * Argument parsing and a refusal helper shared by export-order.ts, erase-order.ts and
 * prune-orders.ts. Three flags across three scripts don't earn a CLI framework — this is
 * the whole shared surface.
 */

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

/** Turns a thrown Error (from assertSafeTarget or anything else) into a message and a non-zero exit, never a raw stack trace. */
export function refuse(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Refused: ${message}`)
  process.exit(1)
}

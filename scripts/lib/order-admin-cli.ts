/**
 * Argument parsing, output-flushing and a refusal helper shared by export-order.ts,
 * erase-order.ts and prune-orders.ts. Three flags across three scripts don't earn a CLI
 * framework — this is the whole shared surface.
 */

export type Target = { email?: string; sessionId?: string }
export type FlagSpec = { name: string; takesValue: boolean }
export type ParsedArgs = Record<string, string | true>

/**
 * Fix round 2: closes a whole class of "some argument shape sneaks past validation"
 * bugs in one place, rather than patching each instance as it's found — round 2's
 * review caught two: `--confirm=true` passed the old allow-list check (which only
 * compared the part before `=`) and then silently read as "not confirmed", a dry run
 * that reports success; and prune-orders.ts, which takes no positional arguments at
 * all, silently discarded any bare argument that didn't start with `--`. Every
 * `--`-prefixed argument must be declared here with whether it takes a value; an
 * unknown flag, a value given to a flag that doesn't take one, a missing value for one
 * that does, or a bare argument nothing consumes, are all rejected before the calling
 * script does anything else.
 */
export function parseArgs(argv: string[], specs: readonly FlagSpec[]): ParsedArgs {
  const specsByName = new Map(specs.map((spec) => [spec.name, spec]))
  const parsed: ParsedArgs = {}
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    const spec = specsByName.get(name)
    if (!spec) {
      throw new Error(`Unrecognised argument: ${name}. This script accepts: ${specs.map((s) => s.name).join(', ')}`)
    }

    if (!spec.takesValue) {
      if (eq !== -1) {
        throw new Error(`${name} takes no value — pass it as a bare flag, not ${name}=<value>.`)
      }
      parsed[name] = true
      i += 1
      continue
    }

    if (eq !== -1) {
      parsed[name] = arg.slice(eq + 1)
      i += 1
    } else {
      const value = argv[i + 1]
      if (value === undefined) {
        throw new Error(`${name} requires a value.`)
      }
      parsed[name] = value
      i += 2
    }
  }
  return parsed
}

/** export-order.ts and erase-order.ts both identify their target this way; prune-orders.ts doesn't take one. */
export function parseTarget(parsed: ParsedArgs): Target {
  const email = typeof parsed['--email'] === 'string' ? parsed['--email'] : undefined
  const sessionId = typeof parsed['--session'] === 'string' ? parsed['--session'] : undefined
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

export function hasConfirm(parsed: ParsedArgs): boolean {
  return parsed['--confirm'] === true
}

/**
 * Fix round 1: `process.stdout`/`process.stderr` are asynchronous to a pipe on every OS
 * and to a file on Windows (this project's platform) — `stream.write()` can still be
 * buffering when the next line runs. `process.exit()` does not wait for that buffer to
 * drain, so a script that logged its result and then called `process.exit()` immediately
 * could truncate output larger than the OS pipe/file buffer, silently, with exit 0. Each
 * script still needs an explicit exit afterward — Payload's pg pool keeps the event loop
 * open, so without one the process just hangs — but only once the write's own callback
 * confirms it actually landed.
 *
 * A single call only flushes the one stream it's given. Fix round 2: erase-order.ts's
 * and prune-orders.ts's partial-failure messages go to the *same* stream (stdout) as the
 * itemised "Redacted #N."/"Deleted #N." lines that precede them, not a different one —
 * a Writable stream's write callbacks fire in submission order, so waiting for this
 * call's write to land guarantees every earlier write to that same stream already
 * landed too. Waiting on a different stream's callback would not.
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

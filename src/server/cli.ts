// Operator commands for self-host installs without a mail server (E8-P7): create accounts and
// reset passwords. They run in their own process, so a closed registration flag stays in-memory.
// Call: npm run cli -- <command> (in the container: node src/server/cli.ts <command>).
import { allowSignupFromCli, auth, verifyEmail } from './auth.ts'

const USAGE = 'usage: cli.ts create-user <email> <name> | cli.ts reset-password <email>'

class CliError extends Error {}

/** Reads one password from stdin without echo: a TTY goes raw, a pipe carries one line. */
async function readPassword(prompt: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    stdin.setEncoding('utf8')
    let typed = ''
    for await (const chunk of stdin) {
      typed += String(chunk)
      const newline = typed.indexOf('\n')
      if (newline !== -1) return typed.slice(0, newline).replace(/\r$/, '')
    }
    if (!typed) throw new CliError('No password on stdin')
    return typed
  }
  process.stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()
  let typed = ''
  try {
    for await (const chunk of stdin) {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') {
          process.stdout.write('\n')
          return typed
        }
        // Ctrl+C must leave the terminal usable instead of ending in raw mode.
        if (char === '\u0003') throw new CliError('canceled')
        if (char === '\u007f' || char === '\b') typed = typed.slice(0, -1)
        else typed += char
      }
    }
  } finally {
    stdin.setRawMode(false)
    stdin.pause()
  }
  return typed
}

async function createUser(email: string, name: string): Promise<number> {
  const context = await auth.$context
  if (await context.internalAdapter.findUserByEmail(email)) throw new CliError(`Account ${email} already exists`)
  const password = await readPassword('Password: ')
  if (password.length < context.password.config.minPasswordLength) {
    throw new CliError(`Password must be at least ${context.password.config.minPasswordLength} characters`)
  }
  // The gate in auth.ts lets this one through; the flag never leaves this process.
  allowSignupFromCli()
  const { user } = await auth.api.signUpEmail({ body: { email, password, name } })
  // Without a verification mail nobody could confirm the address, so the operator's account starts
  // verified; with a mail server there is still nobody to click the link.
  if (verifyEmail && !user.emailVerified) {
    await context.internalAdapter.updateUser(user.id, { emailVerified: true })
  }
  console.log(`Created account ${email}.`)
  return 0
}

async function resetPassword(email: string): Promise<number> {
  const context = await auth.$context
  const found = await context.internalAdapter.findUserByEmail(email)
  if (!found) throw new CliError(`No account for ${email}`)
  const account = await context.internalAdapter.findCredentialAccount(found.user.id)
  if (!account) throw new CliError(`Account ${email} has no password`)
  const password = await readPassword('New password: ')
  if (password.length < context.password.config.minPasswordLength) {
    throw new CliError(`Password must be at least ${context.password.config.minPasswordLength} characters`)
  }
  // Better Auth's own hasher and adapter: the auth tables belong to ebb_auth, not to withSystem().
  await context.internalAdapter.updateAccount(account.id, { password: await context.password.hash(password) })
  // A reset must end every open session, otherwise an old cookie keeps working.
  await context.internalAdapter.deleteUserSessions(found.user.id)
  console.log(`Password reset for ${email}.`)
  return 0
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  if (command === 'create-user' && args.length === 2) return createUser(args[0]!.toLowerCase(), args[1]!)
  if (command === 'reset-password' && args.length === 1) return resetPassword(args[0]!.toLowerCase())
  console.error(USAGE)
  return 2
}

/** The auth pool keeps the event loop alive, so the CLI leaves after flushing its output. */
async function leave(code: number): Promise<void> {
  await Promise.all(
    [process.stdout, process.stderr].map((stream) => new Promise<void>((resolve) => stream.write('', () => resolve()))),
  )
  process.exit(code)
}

try {
  await leave(await main(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  await leave(1)
}

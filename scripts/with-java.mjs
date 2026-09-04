#!/usr/bin/env node
// Tiny cross-platform wrapper: prepends the repo's portable JRE to PATH (if
// present) so `firebase emulators:*` can find `java` without relying on a
// system install, then execs the given command with that PATH.
//
// If .tools/jre/bin doesn't exist (e.g. CI has a system Java on PATH
// already, or a contributor hasn't fetched the portable JRE), PATH is left
// untouched and the command runs as-is.
//
// Usage: node scripts/with-java.mjs <command> [args...]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const jreBin = path.join(repoRoot, '.tools', 'jre', 'bin');

const env = { ...process.env };
// Windows env var keys are case-insensitive but a plain object copy isn't -
// find whatever casing the OS actually gave us (PATH / Path / etc).
const pathKey = Object.keys(env).find(k => k.toLowerCase() === 'path') ?? 'PATH';

if (existsSync(jreBin)) {
  env[pathKey] = `${jreBin}${path.delimiter}${env[pathKey] ?? ''}`;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-java.mjs <command> [args...]');
  process.exit(1);
}

// Node's `spawn(cmd, args, { shell: true })` does NOT quote/escape an args
// array for you (see DEP0190) - it just joins them with spaces, which
// silently breaks any arg containing whitespace (e.g. the "cross-env ...
// vitest run" script string passed to `firebase emulators:exec`). Quote
// each arg ourselves and hand the shell a single command-line string.
//
// Inside double quotes a POSIX shell still expands a dollar sign, a backtick
// and a backslash, so those are escaped too; cmd.exe understands none of those
// escapes and only needs the quotes. The arguments only ever come from
// package.json today, but a wrapper that hands strings to a shell should not
// depend on that staying true.
const quote = arg => {
  if (!/[\s"$`\\]/.test(arg)) return arg;
  const inner = process.platform === 'win32'
    ? arg.replace(/"/g, '\\"')
    : arg.replace(/[\\"$`]/g, ch => '\\' + ch);
  return `"${inner}"`;
};
const commandLine = [command, ...args].map(quote).join(' ');

const child = spawn(commandLine, { stdio: 'inherit', shell: true, env });
child.on('error', err => {
  console.error(err);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});

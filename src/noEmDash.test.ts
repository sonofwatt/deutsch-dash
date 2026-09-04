/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * The loudest rule in CLAUDE.md, made mechanical.
 *
 * "Never use an em dash" applies to everything: code comments, commit messages,
 * this repo's docs, and anything the app prints. It is the only rule here that
 * has ever needed a 268-instance sweep (`e6c6feb`, 2026-08-31). Nothing enforced
 * it afterwards, so that sweep's own miss - a comment in `.gitignore`, committed
 * months before the rule existed and therefore never in anyone's diff - sat there
 * until somebody grepped by hand in `c73e341`.
 *
 * So the grep runs on every `npm test` instead. It takes its file list from
 * `git ls-files` rather than walking `src/`, because the rule is about the repo
 * and not about the app: the miss was in `.gitignore`, and the sweep before it
 * reached `docs/` and `README.md` too. A new file is covered the moment it is
 * staged, with nothing to remember.
 *
 * The two characters are written as escapes below. Spelled literally they would
 * make this file the thing it forbids and the guard would flag itself, which is
 * also why `CLAUDE.md` names them rather than showing them.
 */
const BANNED = /[\u2014\u2013]/; // U+2014 EM DASH, U+2013 EN DASH

/** Tracked files only, so `node_modules` and `dist` are excluded by definition. */
function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

describe('no em dashes', () => {
  it('no tracked file contains one', () => {
    const files = trackedFiles();
    // An empty list would pass the sweep below without looking at anything, so
    // prove the list is real before trusting a green result from it.
    expect(files).toContain('CLAUDE.md');

    const hits: string[] = [];
    for (const file of files) {
      const bytes = readFileSync(file);
      if (bytes.includes(0)) continue; // the two icon PNGs are not prose
      bytes
        .toString('utf8')
        .split('\n')
        .forEach((line, i) => {
          if (BANNED.test(line)) hits.push(`${file}:${i + 1}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('still recognises the characters it is looking for', () => {
    // Without this, a pattern that quietly stopped matching would report green
    // forever, which is the same failure mode the two coverage guards exist for.
    expect(BANNED.test(String.fromCharCode(0x2014))).toBe(true);
    expect(BANNED.test(String.fromCharCode(0x2013))).toBe(true);
    expect(BANNED.test('a plain - hyphen is the replacement')).toBe(false);
  });

  it('the rule is still written down, which is what this guard enforces', () => {
    // If the rule is ever dropped, this fails and the guard goes with it on
    // purpose, rather than outliving the decision it was enforcing.
    expect(readFileSync('CLAUDE.md', 'utf8')).toContain('Never use an em dash');
  });
});

# Deutsch Dash

## Writing

**Never use an em dash.** Not in code comments, not in commit messages, not in the
handoff, not in anything the app itself prints, and not in replies. Use a plain
hyphen with spaces around it, a colon, or a full stop and a new sentence.

That covers its lookalikes too. Out: U+2014 EM DASH and U+2013 EN DASH. In: the
ordinary hyphen-minus, U+002D. Named rather than shown, because a sweep for the
characters would otherwise eat this line.

## Where the rest of it is written down

`handoff.md` is the long form: what every decision is for, which traps cost an
afternoon, and what has never been tested. Read it before changing anything on the
board, in `src/state/store.ts`, or in `database.rules.json`.

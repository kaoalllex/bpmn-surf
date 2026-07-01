---
name: tests
description: Write and run unit tests for changed code. Use when adding or changing behavior in a covered file, or when a fix needs a regression test. Triggers - new logic, bug fix, "add a test", changing a class under test.
---

# Skill: tests

The unit suite (`npm test`, `node:test` + jsdom) is your safety net. Read `docs/testing.md` for the layout before writing a test.

## For a bug fix (test-first)

1. Write a test that **reproduces the bug** (asserts the correct behavior). Put it in the mirror path: `src/<path>/x.js` → `test/<path>/x.test.js`.
2. Run `npm test`; confirm the new test **fails** for the right reason.
3. Write the minimal fix.
4. Run `npm test`; confirm it **passes** and nothing else broke.

## For new / changed behavior

1. Implement the change.
2. Add a test in the mirror path covering the new behavior.
3. Run `npm test`; make it green.

## Rules

- Test the **current intended** behavior; never weaken an existing test just to make it pass — that hides a regression.
- A new `src/**/*.js` file needs a mirror test (or an entry in `UNTESTED_BY_DESIGN` with a reason) or the structural test fails — see `docs/testing.md`.
- To wire a new class into the harness: add it to `SCOPE_FILES` and `EXPORTED_NAMES` in `test/support/scope.js` (details in `docs/testing.md`).
- Finish with the `verify` skill.

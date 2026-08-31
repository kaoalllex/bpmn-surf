---
id: UX-0001
title: Conditions on Sequence Flow — ignore insignificant whitespace
priority: medium
status: done
---

## Statement

When comparing conditions on a Sequence Flow (`bpmn:conditionExpression`), insignificant whitespace and line breaks outside string literals should be ignored. Additionally — improve the readability of long/complex expressions when displaying them.

## Context

- Example of a change that only reformats a condition expression without altering its meaning:
  ```
  before:                                 after:
  ${                                      ${
    ( !execution.hasVariable("skip…") ||    !(execution.hasVariable("skip…") &&
      !skipRelatedSearch )   &&             skipRelatedSearch ) &&
    estates.hasAnyEstate…()               estates.hasAnyEstate…()
  }                                       }
  ```
- Affected files: `bpmn-xml-comparator.js#normalizeExpression` (comparison), `condition-formatter.js` (display).

## Work log

<!-- Each AI session on the task is a separate entry following the template below.
     Add new entries on top (freshest first). -->

### 2026-06-15 · claude-opus-4-8 · (branch `feature/ux-0001-condition-readability`)

Finished the readability of condition-expression display in `ConditionFormatter`:
- all whitespace material outside string literals (spaces, tabs, line breaks) is treated as insignificant — the formatter builds the indentation itself, the original XML layout no longer leaks into the output (previously multi-line conditions were rendered with embedded `\n`/`\t`);
- a parenthesis after `!` (and any non-word character) is recognized as grouping, not a function call — previously `!(...)` broke the indentation;
- trailing whitespace at line ends is trimmed (`trimEnd` in `#flush`);
- significant whitespace inside string literals is preserved.
Covered by unit tests (`test/differ/bpmn/condition-formatter.test.js`). The task is closed.

### 2026-06-11 · — · (branch `fix/backlog-autonomous-fixes`)

When comparing `bpmn:conditionExpression`, insignificant whitespace and line breaks outside string literals are now ignored (`bpmn-xml-comparator.js#normalizeExpression`). Remaining: improve the readability of long/complex expressions when displaying them.

---
id: FEAT-0042
title: User-defined review rules
priority: medium
status: open
---

## Statement

The built-in rules of [FEAT-0040] cannot know every team's conventions: one team cares when
an asynchronous continuation is dropped, another when one particular task header changes.
Users add their own rules in the profile, without code: which elements, which change, what
to tell the reviewer and at which level. Custom rules produce findings exactly like built-in
ones.

Requirements:

1. A custom rule states:
   - **which elements**: any, or a list of element types; optionally limited to Camunda 7
     or Camunda 8 (applied to the version the change belongs to);
   - **which change**: a field (an attribute or an extension element, with its namespace) or
     a whole property group; for repeated entries (headers, mappings, properties) the entry
     is identified by its key, and the value test applies to that same entry;
   - **the operation**: changed, added, removed, or any;
   - **optionally, a value test** on the old or the new value: equals, matches a glob
     pattern (case-sensitive unless stated), is absent. "Absent", "empty string" and "the
     engine default" are distinct;
   - **level and reason** (plain text, never interpreted as markup).
2. Custom rules appear in their own group of the profile tree; they can be switched off,
   re-levelled, edited and deleted. "Reset to defaults" restores the built-in rules and keeps
   the custom ones.
3. Built-in rules that fit this form can be edited the same way; those that need their own
   logic (removed wait state, default flow, DMN rule order…) can only be switched off and
   re-levelled. The profile tree says which is which.
4. Rules are declarative. No user-supplied code is ever executed.
5. **Import/export of rules**: as part of the settings export, and as a rule-only file with a
   format version. Import rejects an unreadable or unknown-version file before applying
   anything; otherwise it imports the valid rules, lists the rejected ones with the reason,
   keeps unrelated settings, handles a repeated id (replace, after confirmation) and reports
   success only after saving.
6. Custom rules are never sent anywhere — they are excluded from the **Wrong flag?** link of
   [FEAT-0040].

Out of scope: rules over the *state* of a model ("every service task must be asynchronous")
— [FEAT-0022], which shares the element selector and the value tests with this task; a
profile shared from the repository — [FEAT-0043]; rules across files.

## Context

GitHub: [#54](https://github.com/kaoalllex/bpmn-surf/issues/54)

Depends on [FEAT-0040]: if its rule table is data from the start, this task adds a source of
rows (the user's settings) and an editor, not a new mechanism. The editor can offer the
fields and groups the comparator knows as a pick list, with free text for unknown extension
elements.

Storage: `chrome.storage.sync` has a per-item and a total quota; a large rule set may not
fit. Decide (e.g. `storage.local` for rules, or a size limit with a clear error) before
building the editor. A failed save must leave the previous profile usable.

Editor location: the options page of [FEAT-0040].

Acceptance:

- "Any change of `camunda:asyncBefore` on a service task → Warning, 'Transaction boundary
  changed: retries and rollback may behave differently'" flags exactly those changes, on
  both sides of Switch branch.
- A rule on one task header (key `priority`) fires on a change of that header and not of
  another header on the same task.
- An invalid pattern is refused in the editor with a message; a reason containing
  `<b>markup</b>` is shown literally.
- Import: twice the same file; one valid and one invalid rule; a conflicting id; an unknown
  format version; a storage failure. Export → fresh profile → identical findings.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

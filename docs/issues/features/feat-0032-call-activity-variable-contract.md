---
id: FEAT-0032
title: Cross-file variable contract check for Call Activities
priority: high
status: open
---

## Statement

Surface, at a Call Activity, the variable contract between the calling diagram and the
process it calls: what the parent passes via `camunda:in`/`camunda:out` against what the
called process actually needs.

The error this targets is passing variables into a Call Activity incorrectly — most often
simply forgetting one. It is the most frequent defect found in BPMN review on this project,
and it is invisible in review today: the contract spans two files, and the second one is
usually not open. The diff shows the call site changing, or the called process changing,
but never the mismatch between them.

Three levels, cheapest first. Level 1 is the MVP; each later level is worth shipping on its
own and should be a separate step.

1. **Show both sides.** When a Call Activity is selected, show what the parent passes next
   to what the called process declares/uses. No validation — just putting the two halves on
   one screen. A forgotten mapping is then a one-second visual catch, and this alone is
   expected to deliver most of the value.
2. **Tie it to the diff.** Flag when the MR changes the called process's variable usage but
   not the `in`/`out` at the call site, or the reverse. This is the pattern of [FEAT-0015]
   (deep handler change analysis) applied to Call Activities, and it is the part that fits a
   review tool best: the reviewer is looking at one file and gets told that the process it
   calls changed its inputs in the same MR.
3. **Check the contract.** Scan the called process for variable names — `${…}`/`#{…}`
   expressions, `camunda:inputOutput`, form fields — and compare against the `in` mappings.
   Also flag `variables="all"`, a known source of surprises.

**Level 3 must be one-directional.** Variables also reach a process from Java delegate code,
which is not in the diagram, so "passed but never used" would produce false positives and
must not be reported as a problem. Only "used but not passed" is sound. Say so in the UI
rather than implying a complete check.

## Context

Came out of a discussion of [FEAT-0030] (token simulation): a simulator cannot catch this
class of error at all — it models no variables, treats a Call Activity as one opaque node
and evaluates no expressions — which is what moved FEAT-0030 down to `low` and prompted
this task.

Most of the machinery already exists:

- **In/Out mapping parsing** — `bpmn-xml-comparator.js:40 #LIST_GROUP_CONFIG` extracts
  `camunda:in`/`camunda:out` entries keyed by `target` and already special-cases
  `businessKey` and `variables="all"` (built for [UX-0002], done).
- **Locating the called file** — `CallActivityLocator.resolveProcessFile(processId, ref)`
  (`call-activity-locator.js:68`) returns `{filePath, fileName}` via targeted blob search,
  cached per ref+processId, with `ProcessFileIndex.findProcessFileParams()` as fallback.
  Fetching the content is then `platformClient.rawFileUrl(ref, filePath)`.
- **Cross-file resolution precedent** — [FEAT-0028] (resolving a message constant from
  another file) is the closest existing shape to copy.
- `camunda-bpmn-moddle` already gives the `camunda:in`/`out` model for free.

Related: [FEAT-0014] highlights the derived "Process variables" group on scope changes —
adjacent but within a single file; this task is about the boundary between two files.

## Open questions

- **Where does level 1 render?** A properties-panel group on the Call Activity, an overlay
  on the element (like the Call Activity dive-in affordance), or a panel of its own.
- **Is the called process fetched eagerly or on selection?** Eager costs a request per Call
  Activity on load; lazy costs a visible delay on first select. The locator's cache makes
  lazy cheap on repeat.
- **Which version of the called file** — the same side that is on screen, presumably; a
  called process that itself changed in the MR has two versions.
- **How far do variable names get scanned in level 3** — direct expressions only, or also
  into the called process's own nested Call Activities.

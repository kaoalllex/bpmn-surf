---
id: FEAT-0041
title: Show layout changes on demand (moved, resized, re-routed elements)
priority: medium
status: open
---

## Statement

The diff compares the model only; the drawing (`bpmndi:`) is ignored, so moving every shape
of a diagram yields an empty diff. That is right for most reviews, but sometimes the point
of a merge request is to tidy a diagram, or a reviewer wants to know what was rearranged.
This task adds a **layout analyzer** to the findings core of [FEAT-0040] and a toolbar
toggle to show its findings. Before/after positions are compared the usual way — with
Switch branch; no ghost outlines are drawn.

Requirements:

1. **What counts as a layout change** (one definition, also used by the "Only the drawing
   differs" notice of [FEAT-0040]) — for elements present on both sides, in the same plane:
   - **moved** — the shape's bounds moved;
   - **resized** — the shape's size changed;
   - **re-routed** — a connection's waypoints changed (count, order or position);
   - **expanded/collapsed** — a subprocess switched between the two.
   Compared in diagram units, not screen pixels (zoom does not matter). Label bounds,
   colours/styles, DI ids and numerically equal values written differently (`100` vs
   `100.0`) are not layout changes.
2. **Threshold**: a difference of less than 3 units on both axes is ignored (snapping noise).
3. **Whole-diagram shift**: when every comparable shape and waypoint of a plane moved by the
   same offset and nothing else changed, it is reported once ("the diagram was shifted"),
   not per element. One exception (a re-routed edge, a resized shape) cancels the
   aggregation.
4. **Toggle**: **Show layout changes** in the toolbar, off by default, remembered for the
   viewer. It is a shortcut for the "Layout" group of the [FEAT-0040] profile, which is
   Hidden by default.
5. **When on**: elements with layout changes take the "moved" colour of the scheme
   ([FEAT-0039]) on both sides of Switch branch; the changes table lists them with their kind
   (moved / resized / re-routed / expanded–collapsed) and counts them separately; the ☼
   outline includes them.
6. **Precedence**: an element with a model change keeps its model colour; its table row
   additionally says it also moved.
7. **Notice**: the "Only the drawing differs" notice states how many elements changed and
   offers a button that turns the toggle on.
8. Pools, lanes, message flows and the elements of subprocess planes are covered.
9. Missing or incomplete DI on one side is reported as such, not as N moved elements.

Out of scope: drawing old positions on the current side; DMN (the differ does not show the
decision-requirements drawing — DMN gets only the [FEAT-0040] notice); edit mode.

## Context

GitHub: [#53](https://github.com/kaoalllex/bpmn-surf/issues/53)

Depends on [FEAT-0040] (core, notice) and [FEAT-0039] (the "moved" colour).

- DI: `bpmndi:BPMNShape` (`dc:Bounds`, `isExpanded`) and `bpmndi:BPMNEdge` (`di:waypoint`),
  keyed by `bpmnElement` → element id; one `bpmndi:BPMNPlane` per diagram plane (collapsed
  subprocesses have their own plane).
- Moving an element into another subprocess, pool or lane is a **model** change, not a
  layout change — see [BUG-0053] (subprocess) and the lane's `flowNodeRef` (already
  compared).
- Painting: `src/differ/bpmn/diff-highlighter.js`; table: `changes-table-view.js`; toolbar
  toggles: `bpmn-differ-view.js` (the ☼ toggle is the pattern).

Open question: should the threshold be a setting?

Acceptance:

- Two tasks moved and one flow re-routed: toggle off → nothing coloured, the notice says 3
  elements and its button turns the toggle on → the three are coloured and listed.
- A diagram shifted 100 units right → one "diagram shifted" entry; the same shift with one
  edge re-routed → per-element entries.
- 2 units → nothing; 3 units → reported.
- Only a label moved, or only a colour changed → not a layout change.
- A service task whose job type changed and that also moved → model colour, row says "also
  moved".
- A resized lane, a re-routed message flow, a move inside an expanded subprocess and inside
  a collapsed subprocess's own plane.

## Work log

<!-- Each AI session on the task — a separate entry by the template below.
     Add new entries on top (freshest first). -->

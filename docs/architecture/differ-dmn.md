# Key files — DMN differ

`src/differ/dmn/`: the DMN orchestrator, view, comparator, painter. Overview, flows and scopes — [`../architecture.md`](../architecture.md).

| File | Purpose |
|------|-----------|
| `dmn-differ.js` | `DmnDiffer` — the DMN diff orchestrator + bootstrap (message listener). Back-navigation (FEAT-0005): wires `BackNavigator` with a `DecisionCallerLocator`; `#getCurrentDecisionIds()` reads the decision ids from the shown XML (not the viewer, which renders only the first decision), `#getShownRef()` picks the displayed side's ref, dive-out opens a BPMN caller via `DifferTabNavigator` with `selectCalledProcessIds=<decision ids>` (the caller then selects its Business Rule Task by `decisionRef`) |
| `dmn-differ-view.js` | `DmnDifferView` — the DOM of the DMN differ page (layout, header, buttons). The same visual language as BPMN: a flex toolbar `.differ-toolbar` with groups and icon zoom (UX-0007); there is no properties panel or splitter. The back-navigation group (`BackNavigator`, FEAT-0005, icon `⤴`) is mounted via `setBackNavigator()` before `build()` and rendered just before Close (mirror of `BpmnDifferView`). Its toolbar ends with `💬` before Close (FEAT-0024); there is no properties panel here, so no panel toggle |
| `dmn-table-viewport.js` | `DmnTableViewport` — zoom/fit/scroll of the dmn-js decision table |
| `dmn-xml-comparator.js` | `DmnXmlComparator` — a semantic comparison of two DMN XMLs → a diff model |
| `dmn-diff-painter.js` | `DmnDiffPainter` — coloring the diff model on the decision-table DOM |

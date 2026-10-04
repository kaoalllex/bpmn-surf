# Changelog

Format: one section per version, header `## <version>`. The latest are at the top.
This file is the human-readable change history and the source of the GitHub release
notes. Updated on release (the `release` skill).

## 1.3.0

- FEAT-0033: add self-managed GitLab hosts from the popup, no file editing
- FEAT-0035: configurable external-task handler annotations, with settings export/import
- FEAT-0024: report a problem from the differ toolbar
- REFAC-0006, UX-0005: the changes table becomes a list of changes — type icons, connections, what changed in each element, following the diagram level on screen
- BUG-0010, BUG-0044: mark the subprocesses enclosing a change; keep the drilled-into subprocess across Switch branch
- BUG-0031, UX-0010: a diff button on every diagram file of the MR, also with all files shown at once; a split View schema button on the blob view
- BUG-0036, BUG-0041: the MR diff button follows the selected file
- BUG-0032: search a merged MR's target commit in its target branch, not `master`
- BUG-0033, BUG-0034, BUG-0035: fix ref resolution for local-file diffs and slashed branches on the blob view
- BUG-0038: fix the 404 of the "search in the repository" fallback link
- BUG-0039, BUG-0042: highlight cancelActivity and multi-instance changes in the properties panel
- BUG-0040: reordered but unchanged child elements are no longer reported as a diff
- BUG-0043: refuse github.com as a host until GitHub support lands
- BUG-0045: edit mode keeps the outline of a subprocess that contains a change
- BUG-0046: the differ tab no longer spins forever when a file request times out
- BUG-0047, BUG-0048: changed-handler links open the right file in the MR tab
- Web-accessible resources are served to https pages only
- Updated bpmn-js, dmn-js and the properties panel; timer and user-assignment changes map to their groups
- A manifest description for the Chrome Web Store

## 1.2.0

- FEAT-0031: edit mode — recolour elements, edit flow conditions, undo/redo, download the edited diagram
- BUG-0003: find the MR tabs container under a fluid layout
- BUG-0027: fix handler navigation picking the wrong file when the topic name is a prefix of another
- BUG-0028: stop falling back to the first search hit when none of them matches the handler topic exactly
- BUG-0029: compare the process a diagram has, executable or not
- BUG-0030: recreate the element outline the diff markers are drawn on
- REFAC-0014, REFAC-0015: close the coverage gaps a mutation sweep found
- INFRA-0001: ship production builds of the vendored libs

## 1.1.0

- BUG-0003: re-add diff button after late GitLab diff render
- BUG-0021: scroll tall props panel inside its cell so footer stays visible
- BUG-0022: keep toolbar on one line, truncate only the file path
- BUG-0023: properties panel empty when shown after loading hidden
- BUG-0024: resolve project id deterministically by path
- BUG-0026: move search panel below the toolbar so it doesn't block Switch branch

## 1.0.0

First **bpmn-surf** release. See the README for the full feature list.

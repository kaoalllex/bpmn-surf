# Changelog

Format: one section per version, header `## <version>`. The latest are at the top.
This file is the source of the "What's new" block in the update window (FEAT-0012) and
a human-readable change history. Updated on release (the `release` skill).

## 1.2.0

- FEAT-0031: edit mode — recolour elements, edit flow conditions, undo/redo, download the edited diagram
- BUG-0027: fix handler navigation picking the wrong file when the topic name is a prefix of another
- BUG-0028: stop falling back to the first search hit when none of them matches the handler topic exactly
- BUG-0029: compare the process a diagram has, executable or not
- BUG-0030: recreate the element outline the diff markers are drawn on
- REFAC-0014, REFAC-0015: close the coverage gaps a mutation sweep found
- INFRA-0001: ship production builds of the vendored libs
- chore: upgrade bpmn-js, dmn-js and the properties panel to their latest releases
- fix: stop hiding the bpmn.io watermark
- chore: license the project under MIT and move the feedback link to GitHub Issues

## 1.1.0

- BUG-0003: re-add diff button after late GitLab diff render
- BUG-0021: scroll tall props panel inside its cell so footer stays visible
- BUG-0022: keep toolbar on one line, truncate only the file path
- BUG-0023: properties panel empty when shown after loading hidden
- BUG-0024: resolve project id deterministically by path
- BUG-0026: move search panel below the toolbar so it doesn't block Switch branch

## 1.0.0

First **bpmn-surf** release. See the README for the full feature list.

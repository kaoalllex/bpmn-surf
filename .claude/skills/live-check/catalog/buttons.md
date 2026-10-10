# MR and branch-view buttons

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

Every bpmn/dmn file block of an MR diff carries one `[icon] Schema diff` /
`Decision diff` button before its ⋮ menu; the blob view has a `[icon] View
schema` / `View decision` split button whose caret menu holds "Diff with local
file…".

**Matrix** — for each diff mode (`diff-mode.mjs on`, then `off`), for each MR
kind below, run all four:

```bash
S=<scratchpad>/live
node test/e2e/live/mr-button.mjs <iid> --shots $S
node test/e2e/live/mr-button.mjs <iid> --legacy --shots $S
node test/e2e/live/mr-button.mjs <iid> --parallel
node test/e2e/live/mr-button.mjs <iid> --legacy --parallel
```

**MR kinds** (pick one each from the listing; create through the API what is
missing): a modified diagram next to code; an added diagram; a deleted one; a
renamed one; a `.dmn`; bpmn + dmn together; a merged MR; many files (≥25, with
diagrams among them — exercises lazy rendering and the legacy virtual
scroller); code only (expect zero buttons).

**Once per diff mode:** `--walk` and `--walk --legacy` on an MR with ≥2 diagrams
and ≥1 code file (checks that no button is visible while rapid diffs greys out
the previous file); `--click` once per UI on an MR whose first file is a diagram (the differ
opens, the file block does not collapse). In all-files mode also run
`--scroll` and `--scroll --legacy` on the many-files MR: the legacy UI mounts
only the blocks near the viewport, so without scrolling most files go unchecked.

**Branch view:** `node test/e2e/live/branch-button.mjs main <path> --shots $S`
for one `.bpmn` and one `.dmn`.

| The runner asserts | You check in the screenshots |
|---|---|
| one button per diagram block, none elsewhere, path = block path | icon and label legible, accent visible |
| label by file type | button right before ⋮, same spot on every file |
| no churn while idle; none visible during the grey-out | header wraps no worse than GitLab's own layout |
| differ tab opens; block not collapsed; split menu opens/closes | branch button beside Blame, not glued to it; menu readable |

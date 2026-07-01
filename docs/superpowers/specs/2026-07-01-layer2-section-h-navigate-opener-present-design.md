# Layer-2 e2e — Section H: `navigateOpenerTab` PRESENT-branch characterization

Status: design approved 2026-07-01. Test-only follow-up unblocked by the Phase 4e
fake-`window.opener` seam.

## Goal

Characterize the **present-opener** branch of `DifferTabNavigator.navigateOpenerTab`
(`src/differ/shared/differ-tab-navigator.js:220`): when a fake same-origin
`window.opener` is installed, clicking the badge of a **changed** handler must
navigate the already-open opener tab to the handler's MR-diff URL — reusing that
tab — instead of falling back to a new tab.

This is a characterization of already-shipped behavior, so PASS is expected. No
`src/` change (the branch is already implemented).

## Behavior under test (verified from source)

Changed-handler click path — `HandlerNavigator.#onOpenCode` (`handler-navigator.js:130-141`):

```js
if (this.#changedHandlers.has(key)) {
    this.#resolveTargetUrl(key).then((url) => {
        if (url && !this.#navigateOpenerFunc(url)) {   // navigateOpenerFunc = navigateOpenerTab
            this.#openUrlFunc(url);                     // openUrlFunc = (u) => window.open(u, '_blank')
        }
    });
    return;
}
```

`navigateOpenerTab(url)` present-branch (`differ-tab-navigator.js:220-242`), with a
non-closed `window.opener`:

```js
const target = DifferTabNavigator.OPENER_TAB_TARGET;   // 'gl-bpmn-diff-opener-tab'
const prevName = opener.name;
opener.name = target;
window.open(url, target);                              // the ONLY window.open on this path
opener.name = prevName;
return true;                                           // -> !true, so openUrlFunc is skipped
```

Consequences:
- Present branch → exactly one `window.open(mrDiffUrl, OPENER_TAB_TARGET)`; the
  bare-url fallback `window.open(url, '_blank')` does **not** fire.
- Absent branch (no opener) → `navigateOpenerTab` returns `false` → fallback
  `window.open(mrDiffUrl, '_blank')`. This is the counterpart already covered by
  the 4d-2 test `test/e2e/differ-handler-badge-click.spec.js` ("changed handler
  click opens the MR diff (opener-tab fallback)").

`mrDiffUrl` = `HandlerLocator.mrFileDiffUrl(filePath, mrIid)` = `prDiffsUrl(42)` +
`#` + SHA-1(filePath) → `http://localhost/mr/42/diffs#<40 hex>` (matches the 4d-2
regex `/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/`).

BPMN-only: `HandlerNavigator`/`navigateOpenerTab` is wired solely in
`bpmn-differ.js:115-124`; `dmn-differ.js` has no handler navigation, so there is no
DMN analog to characterize.

## Capture seam decision — reuse `test/e2e/support/dive-out-capture.js`

`installCapture(page, { opener: true })`:
- Records `window.open` as `[url, name]` → **distinguishes** the present branch
  `[mrDiffUrl, OPENER_TAB_TARGET]` from the fallback `[mrDiffUrl, '_blank']`. This
  is exactly the discrimination the characterization needs.
- Installs a sticky fake `window.opener` (`{ closed:false, name:'', focus(){} }`),
  so the present branch runs with **no `src/` seam**.
- Its extra `window.openDiffer`/`window.close` stubs are harmless (never hit on the
  changed-handler path).

Rejected alternative — extend `handler-open-capture.js` to record `[url, name]`:
that file currently records a single-arg `[url]`, and the 4d-2 tests assert against
that shape (`toEqual(['about:blank'])`, `[url]`). Changing it would break 4d-2 or
require weakening/editing those tests. Out of scope; the seam must **distinguish**
the two branches without touching 4d-2.

No support-file edits, no new fixtures, no `boot-differ.js` change.

## Test plan — one spec, one test

New file `test/e2e/differ-handler-badge-opener.spec.js` (one concern per file, à la
4d/4e). Reuses `handler-badges.bpmn` (via `HANDLER_BADGES_BPMN`) and the same
fixture/params recipe as the 4d-2 changed-handler test:

```js
await bootBpmnDiffer(page, {
    params: defaultBpmnParams({ changeRequestId: 42 }),
    fixtures: {
        xmlByRef: { 'mr-sha': HANDLER_BADGES_BPMN, 'base-sha': HANDLER_BADGES_BPMN },
        changedFiles: [{ path: 'src/ScoreCarTask.kt', status: 'added' }],
        contentByRefPath: {
            'mr-sha:src/ScoreCarTask.kt': '@ExternalTaskSubscription("scoreCar")\nclass ScoreCarTask'
        }
    }
});
await installCapture(page, { opener: true });
const openerTarget = await page.evaluate(() => DifferTabNavigator.OPENER_TAB_TARGET);

const badge = page.locator('.handler-link-added');
await expect(badge).toBeVisible();
await badge.click();

await expect.poll(async () => (await getOpenCalls(page)).length).toBe(1); // no bare-url fallback
const [[url, name]] = await getOpenCalls(page);
expect(url).toMatch(/^http:\/\/localhost\/mr\/42\/diffs#[0-9a-f]{40}$/);   // sha1-anchored MR diff
expect(name).toBe(openerTarget);                                          // present branch, not '_blank'
```

Non-vacuity: the test asserts the positive open-with-target fired, and the
single-call length rules out the fallback (`name` is `OPENER_TAB_TARGET`, not
`'_blank'`). The 4d-2 fallback test is the documented absent-branch contrast; a
short comment in the new file cross-references it.

A second in-file control was considered and rejected as redundant with 4d-2.

## Guardrails

- TEST-ONLY: no `src/` change (present branch is already implemented — we
  characterize, not modify). No new fixtures. No `boot-differ.js` or support-file
  edit. Do not modify or break the 4d-2 tests — run
  `test/e2e/differ-handler-badge-click.spec.js` to confirm.
- Branch `feature/e2e-section-h` from fresh `origin/master`.
- e2e under `CI=1` (hermetic, port 4173): `CI=1 npx playwright test <file>`.
  Spec files are `*.spec.js` (never `*.test.js`).
- Characterization of shipped behavior → PASS expected. A RED is a real finding:
  do not weaken asserts, do not touch `src/`; debug via systematic-debugging; a
  genuine bug is the user's call.
- Vanilla JS (ES6+); comments/docs in English. Commits minimal, without
  `Co-Authored-By` or tool mentions.

## Done criteria

- `npm test` green (1060 unit).
- `CI=1 npm run test:e2e` green: baseline 95 e2e + 1 new = **96 e2e**.
- Push + MR into master via the `mr` skill (`--remove-source-branch`). Merge is the
  human's.
- Update auto-memory `layer2-e2e-coverage.md` with the Section H present-branch note
  (what is covered, which seam, final e2e count).

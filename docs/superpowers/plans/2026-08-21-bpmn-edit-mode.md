# BPMN Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user open the BPMN diagram the differ is showing in an editable
second tab, edit it with the diff against the opening version painted live, and
download the result as one `.bpmn` file.

**Architecture:** The differ already renders through the full `BpmnJS` **Modeler**
— editing is muted, not absent. Edit mode gates the four mutes behind a `mode`
param, binds the keyboard module, and adds an `EditSession` that snapshots the
XML right after import (the baseline), recomputes `BpmnXmlComparator.compare()`
on a debounce, and paints the result as **CSS markers** — never `modeling.setColor`
— so the command stack stays the user's own and stays an honest dirty flag. The
download re-applies those same colours onto the exported XML string with a pure
colorizer.

**Tech Stack:** Vanilla JS (ES6+ classes, `#private` fields), no build step, no new
runtime dependency. Scripts load as plain `<script>` tags into one shared global
scope. Unit tests: `node:test` + jsdom through `#scope`. E2E: Playwright on
`test/e2e/support/boot-differ.js`.

**Spec:** `docs/issues/features/feat-0031-bpmn-edit-mode.md` (FEAT-0031) — read it
first; it carries the colour-layer table, the deliberate exclusions and the risk
list this plan implements.

## Global Constraints

- **`libs/` is generated** — never edit by hand (`npm run sync:libs`).
- **Vanilla JS (ES6+) only**; no new runtime dependency, no bundler, no build step.
- **Script load order matters.** A new `src/` file must be registered in all three
  places, in dependency order: `manifest.json#web_accessible_resources`,
  `utils.js#loadScripts`, `test/support/scope.js#SCOPE_FILES`.
- **master is protected** — work on a feature branch off local master. **No remote:**
  the task is done at green tests + local commits. No push, no `/mr`, no `/cleanup`.
- **`npm test` must be green** before declaring any task done. E2E: `npm run test:e2e`.
- Code, comments, commits and docs in **English**. No ticket ids in code comments
  unless the surrounding file already carries them (this project does: `BUG-0011`
  style references are the local convention).
- **`differ-view-only.spec.js` must stay green throughout.** It is the regression
  guard for [BUG-0011]/[BUG-0014]/[BUG-0015] and proves the viewer did not become
  editable. Run it after every task that touches `bpmn-differ.js` or `styles.css`.
- New files live in `src/differ/bpmn/edit/`; their tests mirror the path under
  `test/differ/bpmn/edit/`.
- Existing `DiffType` palette is the source of colour truth:
  `ADD = {shapeColor:'#88ff88', rowColor:'#00aa00'}`,
  `CHANGE = {shapeColor:'#8888ff', rowColor:'#0000aa'}`,
  `REMOVE = {shapeColor:'#ff8888', rowColor:'#aa0000'}`.

---

### Task 1: `mode` / `editSide` params and the edit identity key

Adds the two wire fields, the params factory for the edit tab, and the
mode-aware identity key that keeps the edit tab from being deduplicated against
the view tab.

**Files:**
- Modify: `src/differ/shared/differ-params.js`
- Test: `test/differ/shared/differ-params.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `params.mode` — `'view' | 'edit'`, defaults to `'view'`
  - `params.editSide` — `'target' | 'source' | null`
  - `DifferParams#toEditDifferParams(editSide)` → plain object (wire params)
  - `DifferParams.identityKeyFor(params, filePath)` — unchanged signature, now
    appends `params.mode || 'view'`
  - `DifferParams#editIdentityKey(editSide)` → string

- [ ] **Step 1: Write the failing tests**

Append to `test/differ/shared/differ-params.test.js`, inside the existing
`describe('DifferParams', ...)` block:

```js
    it('defaults mode to view and editSide to null', () => {
        const p = new DifferParams(validParams);
        assert.equal(p.mode, 'view');
        assert.equal(p.editSide, null);
    });

    it('accepts edit mode with a side', () => {
        const p = new DifferParams({ ...validParams, mode: 'edit', editSide: 'target' });
        assert.equal(p.mode, 'edit');
        assert.equal(p.editSide, 'target');
    });

    it('rejects an unknown mode', () => {
        assert.throws(() => new DifferParams({ ...validParams, mode: 'nonsense' }), /mode/);
    });

    it('keeps the view identity key free of a mode suffix change', () => {
        // The dive-in path precomputes the key the TARGET tab will publish, so the
        // view-mode key must stay stable across this change (BUG-0017).
        const p = new DifferParams(validParams);
        assert.equal(
            p.identityKey(),
            [validParams.platform.projectUrl, '', 'abc123', 'master', 'src/process.bpmn', 'view'].join('\n'));
    });

    it('gives the edit tab a different identity key than the view tab', () => {
        const p = new DifferParams(validParams);
        assert.notEqual(p.editIdentityKey('target'), p.identityKey());
        assert.ok(p.editIdentityKey('target').endsWith('edit'));
    });

    it('gives each edited side its own identity key', () => {
        const p = new DifferParams(validParams);
        assert.notEqual(p.editIdentityKey('target'), p.editIdentityKey('source'));
    });

    it('carries the rename and local-file fields into the edit params', () => {
        // toNestedDifferParams drops these (it targets a DIFFERENT file); the edit
        // tab shows the SAME file, so losing them would load the wrong base path.
        const p = new DifferParams({
            ...validParams,
            targetFilePath: 'src/old-name.bpmn',
            targetLabel: 'master'
        });
        const edit = p.toEditDifferParams('target');
        assert.equal(edit.mode, 'edit');
        assert.equal(edit.editSide, 'target');
        assert.equal(edit.filePath, 'src/process.bpmn');
        assert.equal(edit.targetFilePath, 'src/old-name.bpmn');
        assert.equal(edit.targetLabel, 'master');
        assert.equal(edit.camundaBpmnModdle, p.camundaBpmnModdle);
    });

    it('carries localFileContent into the edit params', () => {
        const localParams = { ...validParams };
        delete localParams.sourceRef;
        const p = new DifferParams({ ...localParams, localFileContent: '<xml/>' });
        assert.equal(p.toEditDifferParams('source').localFileContent, '<xml/>');
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/differ/shared/differ-params.test.js`
Expected: FAIL — `p.mode` is `undefined`, `p.editIdentityKey is not a function`.

- [ ] **Step 3: Implement**

In `src/differ/shared/differ-params.js`, add to the class body above `constructor`:

```js
    static MODE_VIEW = 'view';
    static MODE_EDIT = 'edit';
    static EDIT_SIDE_TARGET = 'target';
    static EDIT_SIDE_SOURCE = 'source';
```

In the constructor, after the `selectCalledProcessIds` assignment:

```js
        // FEAT-0031: 'edit' turns this tab into an editor for ONE side of the diff.
        // It is a postMessage param like every other field here — a differ tab has
        // no URL of its own.
        this.mode = params.mode || DifferParams.MODE_VIEW;
        if (this.mode !== DifferParams.MODE_VIEW && this.mode !== DifferParams.MODE_EDIT) {
            throw new Error(`unknown mode: ${this.mode}`);
        }
        // Which version is being edited (and so is the diff baseline): the side that
        // was on screen when the user pressed the edit button. null in view mode.
        this.editSide = this.mode === DifferParams.MODE_EDIT
            ? (params.editSide || DifferParams.EDIT_SIDE_SOURCE)
            : null;
```

Replace `identityKeyFor` with the mode-aware version and add the two helpers:

```js
    static identityKeyFor(params, filePath) {
        return [
            params.platform.projectUrl,
            params.changeRequestId || '',
            params.sourceRef || '',
            params.targetRef,
            filePath,
            // FEAT-0031: an edit tab is a different tab than the view tab of the
            // same diagram, so it must not be deduplicated against it. Plain
            // objects (the wire params of a tab about to be opened) have no mode
            // field yet, hence the 'view' default on both sides of the comparison.
            DifferParams.#modeKeyFor(params)
        ].join('\n');
    }

    static #modeKeyFor(params) {
        const mode = params.mode || DifferParams.MODE_VIEW;
        return mode === DifferParams.MODE_EDIT
            ? `${mode}:${params.editSide || DifferParams.EDIT_SIDE_SOURCE}`
            : mode;
    }

    // The key the edit tab for the given side will publish — computed BEFORE
    // opening it, so a second press of the edit button focuses the open editor
    // instead of starting a second session (BUG-0017 machinery).
    editIdentityKey(editSide) {
        return DifferParams.identityKeyFor(
            { ...this, mode: DifferParams.MODE_EDIT, editSide }, this.filePath);
    }

    // Wire params for an edit tab on the SAME file. Deliberately not
    // toNestedDifferParams(): that one targets a DIFFERENT file and drops
    // targetFilePath (BUG-0002 rename) and localFileContent, both of which the
    // edit tab still needs to load the same two versions this tab loaded.
    toEditDifferParams(editSide) {
        return {
            platform: this.platform,
            sourceRef: this.sourceRef,
            sourceLabel: this.sourceLabel,
            localFileContent: this.localFileContent,
            changeRequestId: this.changeRequestId,
            targetRef: this.targetRef,
            targetLabel: this.targetLabel,
            filePath: this.filePath,
            targetFilePath: this.targetFilePath,
            fileName: this.fileName,
            camundaBpmnModdle: this.camundaBpmnModdle,
            mode: DifferParams.MODE_EDIT,
            editSide: editSide
        };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/differ/shared/differ-params.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Run the whole unit suite (identityKey has four call sites)**

Run: `npm test`
Expected: PASS. If a differ-tab-navigator test asserts a literal key, update it to
the six-field form — the key gained a trailing `\nview`.

- [ ] **Step 6: Commit**

```bash
git add src/differ/shared/differ-params.js test/differ/shared/differ-params.test.js
git commit -m "feat(FEAT-0031): mode/editSide params and the edit identity key"
```

---

### Task 2: Edit mode boots — un-mute the modeler behind the mode flag

Turns on real editing when `mode === 'edit'`: the four mutes are gated, the
keyboard module is bound, only the edited side is imported, and the toolbar shows
the edit group instead of "Switch branch" / `☼`. The `✎` button appears in view
mode and opens the edit tab.

**Files:**
- Modify: `src/differ/bpmn/bpmn-differ.js`
- Modify: `src/differ/bpmn/bpmn-differ-view.js`
- Modify: `src/differ/styles.css`
- Create: `test/e2e/differ-edit-boot.spec.js`

> **Correction (post-implementation ruling).** An earlier draft of this task had
> `keyboard.bind(document)` here. That was wrong: `Keyboard` binds itself on
> `canvas.init` unless `config.keyboard.bind === false`, and `bind(node)` has been
> unsupported since diagram-js 15 — it logs `console.error` and binds to the canvas
> SVG regardless. The call is dead code; delete it rather than fix its argument.
- Test (must stay green): `test/e2e/differ-view-only.spec.js`

**Interfaces:**
- Consumes: `params.mode`, `params.editSide`, `params.toEditDifferParams(side)`,
  `params.editIdentityKey(side)` from Task 1.
- Produces:
  - `BpmnDifferView` callback `onOpenEditor()` — fired by the `✎` button
  - `BpmnDifferView#isEditMode()` (private read of `params.mode`) driving the toolbar
  - `BpmnDifferView` callbacks `onUndo()`, `onRedo()`, `onToggleEditColoring() → bool`
    (wired to no-ops in this task, filled in by Tasks 6 and 7)
  - `BpmnDiffer#isEditMode()` (private) — `this.#params.mode === 'edit'`
  - CSS class `differ-edit-mode` on `document.body` in edit mode

- [ ] **Step 1: Write the failing e2e test**

Create `test/e2e/differ-edit-boot.spec.js`:

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

// FEAT-0031: in edit mode the four BUG-0011/0014/0015 mutes are lifted, so the
// modeler's own editing UI is back.
test('edit mode shows the palette and the context pad', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.djs-palette')).toBeVisible();

    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    await expect(page.locator('.djs-context-pad')).toBeVisible();
});

// The EDIT_EVENTS veto is gated by the mode, so a drag really moves the shape.
test('edit mode lets a shape be dragged', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const shape = page.locator('svg .djs-element[data-element-id="Task_1"]');
    const before = await shape.boundingBox();
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2 + 60, { steps: 10 });
    await page.mouse.up();

    const after = await shape.boundingBox();
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
});

// The properties-panel beforeinput veto is gated too, so the Name field accepts text.
test('edit mode lets the properties panel be typed into', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.bio-properties-panel-scroll-container')).toBeVisible();
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();

    const generalHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'General' });
    await expect(generalHeader).toBeVisible();
    if (!await generalHeader.evaluate((el) => el.classList.contains('open'))) {
        await generalHeader.click();
    }

    const nameInput = page.locator('#bio-properties-panel-name');
    await expect(nameInput).toHaveValue('Review request');
    await nameInput.click();
    await page.keyboard.type('ZZZ');
    await expect(nameInput).toHaveValue('Review requestZZZ');
});

// The changes table belongs to review, not to an editor (FEAT-0031).
test('edit mode renders no changes table and no Switch branch', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('.changes-table')).toHaveCount(0);
    await expect(page.getByText('Switch branch')).toHaveCount(0);
});

// View mode offers the entry point; edit mode does not offer it again.
test('the edit button is present in view mode and absent in edit mode', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page);
    await expect(page.getByTitle('Edit this diagram in a new tab')).toBeVisible();

    await bootBpmnDiffer(page, { params: editParams() });
    await expect(page.getByTitle('Edit this diagram in a new tab')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test test/e2e/differ-edit-boot.spec.js`
Expected: FAIL — the palette is `display:none`, no `✎` button, "Switch branch" present.

- [ ] **Step 3: Gate the four mutes in `bpmn-differ.js`**

Add the private helper next to `#getShownRef()`:

```js
    // FEAT-0031: edit mode lifts the BUG-0011/0014/0015 mutes for THIS tab only.
    #isEditMode() {
        return this.#params.mode === DifferParams.MODE_EDIT;
    }
```

In `show()`, wrap mute 1 (the `EDIT_EVENTS` veto), mute 2 (props `beforeinput`)
and mute 3 (canvas `beforeinput`), and bind the keyboard:

```js
        if (this.#isEditMode()) {
            // No keyboard.bind() call: diagram-js binds Keyboard implicitly on
            // canvas.init (to the canvas SVG, which carries tabindex), so undo/redo,
            // Delete and copy/paste are live as soon as the canvas has focus. Passing
            // an explicit node is unsupported since diagram-js 15 and only logs an
            // error. Focus-scoped is what we want anyway: keystrokes in the
            // properties panel never reach the canvas bindings.
            // Mute 4 (palette + context pad) is CSS — see the body class below.
            document.body.classList.add('differ-edit-mode');
        } else {
            // BUG-0011: veto edit interactions on the canvas. High priority so the
            // veto fires before the default editing handlers; returning false aborts
            // the action so no command is created.
            bpmnJSEventBus.on(BpmnDiffer.EDIT_EVENTS, 2000, () => false);

            // BUG-0014 / BUG-0015: keep the properties-panel fields and the canvas
            // label overlay selectable and copyable while blocking edits, via a
            // delegated capture-phase `beforeinput` veto on each stable container.
            for (const containerId of [BpmnDifferView.PROPS_ID, BpmnDifferView.CANVAS_ID]) {
                const container = document.getElementById(containerId);
                if (container) {
                    container.addEventListener('beforeinput', (event) => event.preventDefault(), true);
                }
            }
        }
```

Delete the two original mute blocks the loop above replaces, but **keep their
comments** — move the BUG-0014 and BUG-0015 explanations above the `for` loop so
the reasoning is not lost.

Guard mute 4 in `#hideModelerPalleteAndPoweredByLabel()`:

```js
    #hideModelerPalleteAndPoweredByLabel() {
        if (!this.#isEditMode()) {
            try {
                document.getElementsByClassName('djs-palette')[0].style.display = 'none';
            } catch (error) {
                console.warn('modeler pallete not found', error);
            }
        }
        try {
            document.querySelector('.bjs-powered-by').style.display = 'none';
        } catch (error) {
            console.warn('powered by label not found', error);
        }
        // BUG-0011: the context-pad (edit-only actions, vetoed via EDIT_EVENTS) is
        // created lazily on first selection, so it is hidden via CSS (.djs-context-pad)
        // rather than here — see styles.css. FEAT-0031 re-shows it via the
        // .differ-edit-mode body class.
    }
```

Import only the edited side — replace the `if (this.#versions.mrXml)` branch in
`show()`:

```js
        if (this.#isEditMode()) {
            // Only the edited side is imported; the other one still feeds colour
            // layer 3 (the MR diff) through #paintDiffs.
            if (this.#params.editSide === DifferParams.EDIT_SIDE_TARGET) {
                await this.#showBranch();
            } else {
                await this.#showMr();
            }
        } else if (this.#versions.mrXml) {
            await this.#showMr();
        } else {
            await this.#showBranch();
        }
```

Wire the `✎` callback into the view construction in `#init()`:

```js
        this.#view = new BpmnDifferView(this.#params, this.#branchIndicator, {
            onDownload: () => this.#downloadShownBranchFile(),
            onSwitchBranch: () => this.#switchBranch(),
            onToggleHighlight: () => this.#toggleHighlight(),
            onOpenEditor: () => this.#openEditor(),
            onUndo: () => this.#bpmnJS.get('commandStack').undo(),
            onRedo: () => this.#bpmnJS.get('commandStack').redo(),
            onToggleEditColoring: () => true
        });
```

Add `#openEditor()` next to `#openDifferForFile()`:

```js
    // FEAT-0031: open THIS diagram, in the version currently on screen, in an edit
    // tab. A second press focuses the editor that is already open (BUG-0017
    // machinery) rather than starting a second session over the same baseline.
    async #openEditor() {
        const editSide = this.#branchIndicator.isTargetBranchShown()
            ? DifferParams.EDIT_SIDE_TARGET
            : DifferParams.EDIT_SIDE_SOURCE;
        if (await this.#tabNavigator.focusExistingDifferTab(this.#params.editIdentityKey(editSide))) {
            return;
        }
        await this.#tabNavigator.openNestedDiffer(
            this.#params.toEditDifferParams(editSide), this.#params.fileName);
    }
```

- [ ] **Step 4: Add the toolbar to `bpmn-differ-view.js`**

Add the private helper and the `✎` button. In `#createHeader`, guard the switch
group and the highlight button, and append the edit group.

```js
    #isEditMode() {
        return this.#params.mode === DifferParams.MODE_EDIT;
    }
```

Replace the switch group block with:

```js
        //--- switch branch — own group, pinned to the right edge so it stays
        //    put regardless of the branch name length (the primary action).
        //    Meaningless in edit mode: the editor owns exactly one side, so the
        //    spacer moves to the view group instead (FEAT-0031).
        if (!this.#isEditMode()) {
            const switchGroup = this.#group();
            switchGroup.classList.add('differ-toolbar-spacer');
            switchGroup.appendChild(this.#button({
                text: 'Switch branch',
                strong: true,
                disabled: !this.#params.isSourceVersionDefined(),
                onClick: () => this.#callbacks.onSwitchBranch()
            }));
            toolbar.appendChild(switchGroup);
        }
```

In the view group, replace the `☼` button block and the `✎` entry point:

```js
        const viewGroup = this.#group();
        if (this.#isEditMode()) {
            viewGroup.classList.add('differ-toolbar-spacer');
        }
        // ... the existing +, −, ⤢ buttons stay exactly as they are ...

        if (this.#isEditMode()) {
            // The "colour the edits" toggle replaces ☼ — it governs the same idea
            // (show the diff) but also governs the export (FEAT-0031).
            this.#coloringButton = this.#button({
                icon: '☑', title: 'Colour the edits — on',
                onClick: () => {
                    this.#editColoringEnabled = this.#callbacks.onToggleEditColoring();
                    this.#refreshColoringButton();
                }
            });
            viewGroup.appendChild(this.#coloringButton);
        } else {
            const highlightButton = this.#button({
                icon: '☼',
                title: 'Turn diff highlight on',
                disabled: !this.#params.isSourceVersionDefined(),
                onClick: () => {
                    const enabled = this.#callbacks.onToggleHighlight();
                    highlightButton.textContent = enabled ? '☀' : '☼';
                    highlightButton.title = enabled ? 'Turn diff highlight off' : 'Turn diff highlight on';
                }
            });
            this.#highlightButton = highlightButton;
            viewGroup.appendChild(highlightButton);

            viewGroup.appendChild(this.#button({
                icon: '✎', title: 'Edit this diagram in a new tab',
                onClick: () => this.#callbacks.onOpenEditor()
            }));
        }
        viewGroup.appendChild(this.#createHidePropsButton());
        toolbar.appendChild(viewGroup);

        //--- edit group (FEAT-0031): undo/redo now, colour swatches added in Task 7
        if (this.#isEditMode()) {
            this.#editGroup = this.#group();
            this.#editGroup.appendChild(this.#button({
                icon: '↶', title: 'Undo (Ctrl+Z)',
                onClick: () => this.#callbacks.onUndo()
            }));
            this.#editGroup.appendChild(this.#button({
                icon: '↷', title: 'Redo (Ctrl+Y)',
                onClick: () => this.#callbacks.onRedo()
            }));
            toolbar.appendChild(this.#editGroup);
        }
```

Declare these with the other private fields:

```js
    #editGroup = null;
    #coloringButton = null;
    #editColoringEnabled = true;
    #editColoringPaused = false;
```

Add the accessor Task 7 will use, plus the paused-state control Task 6 drives:

```js
    // The edit-mode toolbar group, so the colour control can append its swatches
    // after construction (FEAT-0031). null in view mode.
    get editGroup() {
        return this.#editGroup;
    }

    // BUG-0029: the recompute cannot always compare (a diagram with no executable
    // process). The colouring then freezes at its last good state, which can be
    // permanent — so say so on the toggle rather than leaving a silently stale diff.
    setEditColoringPaused(paused) {
        this.#editColoringPaused = paused;
        this.#refreshColoringButton();
    }

    #refreshColoringButton() {
        if (!this.#coloringButton) {
            return;
        }
        if (this.#editColoringPaused) {
            this.#coloringButton.textContent = '⚠';
            this.#coloringButton.title =
                'Colour the edits — paused: the diagram has no executable process';
            return;
        }
        this.#coloringButton.textContent = this.#editColoringEnabled ? '☑' : '☐';
        this.#coloringButton.title =
            `Colour the edits — ${this.#editColoringEnabled ? 'on' : 'off'}`;
    }
```

Suppress the footer in edit mode — replace the footer block in `build()`:

```js
        // The changes table earns its place in MR review, where somebody else made
        // the changes. In an editor the user just made them and sees them on the
        // canvas, so edit mode renders no table (FEAT-0031).
        if (this.#params.isSourceVersionDefined() && !this.#isEditMode()) {
```

- [ ] **Step 5: Un-hide the palette and context pad in `styles.css`**

Below the existing `.djs-context-pad { display: none !important; }` rule add:

```css
/* FEAT-0031: edit mode is the one place the modeler's own editing UI is wanted
   back. The mutes above stay the default; this class (set on <body> by
   BpmnDiffer in edit mode) lifts the CSS ones. The JS mutes are gated in
   bpmn-differ.js by the same mode flag. */
body.differ-edit-mode .djs-context-pad {
    display: block !important;
}

body.differ-edit-mode .bio-properties-panel select,
body.differ-edit-mode .bio-properties-panel [contenteditable],
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-feel-editor,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-toggle-switch__switcher,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-feel-toggle-switch,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-checkbox,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-feel-checkbox,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-add-entry,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-remove-entry,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-remove-list-entry,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-group-header-button,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-dropdown-button,
body.differ-edit-mode .bio-properties-panel .bio-properties-panel-open-feel-popup {
    pointer-events: auto;
}
```

- [ ] **Step 6: Run the new e2e test to verify it passes**

Run: `npx playwright test test/e2e/differ-edit-boot.spec.js`
Expected: PASS, all five cases.

- [ ] **Step 7: Run the regression guard and the unit suite**

Run: `npx playwright test test/e2e/differ-view-only.spec.js test/e2e/differ-boot.spec.js test/e2e/differ-changes-table.spec.js && npm test`
Expected: PASS. `differ-view-only.spec.js` proves the viewer is still read-only.

- [ ] **Step 8: Commit**

```bash
git add src/differ/bpmn/bpmn-differ.js src/differ/bpmn/bpmn-differ-view.js \
        src/differ/styles.css test/e2e/differ-edit-boot.spec.js
git commit -m "feat(FEAT-0031): boot the differ in edit mode with the mutes lifted"
```

---

### Task 3: `EditColorResolver` — the pure colour-layer table

The whole colour model of FEAT-0031 as one pure function: an ordered list of diff
layers plus the set of elements that already carry a colour in the model, in;
"what we paint on each element", out.

**Files:**
- Create: `src/differ/bpmn/edit/edit-color-resolver.js`
- Modify: `manifest.json`, `src/core/utils.js`, `test/support/scope.js`
- Test: `test/differ/bpmn/edit/edit-color-resolver.test.js`

**Interfaces:**
- Consumes: the global `DiffType` (`src/differ/shared/diff-type.js`).
- Produces:
  - `EditColorResolver.resolve(layers, explicitlyColoredIds)` →
    `Map<string, { diffType: object, outlineOnly: boolean }>`
  - `layers`: `[{ ids: string[], diffType: DiffType.ADD }, ...]`, highest priority
    first; the first layer that names an id wins
  - `explicitlyColoredIds`: `Set<string>`
  - `EditColorResolver.explicitlyColoredIdsOf(elementRegistry)` → `Set<string>`

- [ ] **Step 1: Write the failing test**

Create `test/differ/bpmn/edit/edit-color-resolver.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditColorResolver, DiffType } = createScope();

describe('EditColorResolver', () => {
    it('paints each layer with its own diff type', () => {
        const map = EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.ADD },
            { ids: ['B'], diffType: DiffType.CHANGE }
        ]);
        assert.equal(map.get('A').diffType, DiffType.ADD);
        assert.equal(map.get('B').diffType, DiffType.CHANGE);
        assert.equal(map.size, 2);
    });

    it('gives the earlier layer priority over the later one', () => {
        // My own edit (layer 2) outranks the MR diff (layer 3) on the same element.
        const map = EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.CHANGE },
            { ids: ['A'], diffType: DiffType.ADD }
        ]);
        assert.equal(map.get('A').diffType, DiffType.CHANGE);
    });

    it('marks an explicitly coloured element as outline-only', () => {
        // A colour in the model (set by the user, or shipped with the file) wins,
        // so we outline the element instead of filling over its colour.
        const map = EditColorResolver.resolve(
            [{ ids: ['A', 'B'], diffType: DiffType.ADD }], new Set(['A']));
        assert.equal(map.get('A').outlineOnly, true);
        assert.equal(map.get('B').outlineOnly, false);
    });

    it('returns an empty map for no layers (the toggle is off)', () => {
        assert.equal(EditColorResolver.resolve([]).size, 0);
    });

    it('tolerates a layer with no ids', () => {
        const map = EditColorResolver.resolve([{ ids: [], diffType: DiffType.ADD }]);
        assert.equal(map.size, 0);
    });

    it('reads explicit colours off the element registry, both namespaces', () => {
        const di = (attrs) => ({ get: (name) => attrs[name] });
        const registry = {
            getAll: () => [
                { id: 'plain', di: di({}) },
                { id: 'omg', di: di({ 'color:background-color': '#ff0000' }) },
                { id: 'legacyFill', di: di({ 'bioc:fill': '#00ff00' }) },
                { id: 'omgBorder', di: di({ 'color:border-color': '#0000ff' }) },
                { id: 'legacyStroke', di: di({ 'bioc:stroke': '#000000' }) },
                { id: 'noDi' }
            ]
        };
        const ids = EditColorResolver.explicitlyColoredIdsOf(registry);
        assert.deepEqual(
            [...ids].sort(), ['legacyFill', 'legacyStroke', 'omg', 'omgBorder']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/differ/bpmn/edit/edit-color-resolver.test.js`
Expected: FAIL — `EditColorResolver` is not defined by the scope.

- [ ] **Step 3: Implement**

Create `src/differ/bpmn/edit/edit-color-resolver.js`:

```js
// FEAT-0031, edit mode: the colour-layer table as a pure function.
//
// Four layers decide what an element looks like; the topmost that applies wins:
//   1. a colour the user set via the colour control   — lives in the model
//   2. my edits vs the baseline (green/blue)          — painted by us
//   3. the MR diff, when opened from diff view        — painted by us
//   4. a colour that came with the file               — lives in the model
//
// Layers 1 and 4 are indistinguishable in the model and are meant to behave the
// same, so they arrive here merged as `explicitlyColoredIds` — an element in that
// set keeps its own colour and gets a dashed OUTLINE in the diff colour instead
// of a fill, so an edit is never invisible. Layers 2 and 3 arrive as `layers`,
// highest priority first.
//
// Nothing here touches the model or the DOM: the same map drives the on-screen
// marker layer (EditDiffPainter) and the exported XML (EditXmlColorizer), which
// is what lets one toggle honestly govern both.
class EditColorResolver {
    // layers: [{ ids: string[], diffType: DiffType.* }, ...] — first match wins.
    // Returns Map<elementId, { diffType, outlineOnly }>. An empty `layers` (the
    // "colour the edits" toggle turned off) yields an empty map.
    static resolve(layers, explicitlyColoredIds = new Set()) {
        const result = new Map();
        for (const layer of layers) {
            for (const id of layer.ids || []) {
                if (result.has(id)) {
                    continue;
                }
                result.set(id, {
                    diffType: layer.diffType,
                    outlineOnly: explicitlyColoredIds.has(id)
                });
            }
        }
        return result;
    }

    // Ids of elements that carry an explicit colour in the model — read fresh from
    // the registry on every recompute rather than tracked, so "reset an element to
    // Default brings its diff colour back" needs no bookkeeping. The attribute
    // names mirror what bpmn-js reads (BpmnRenderUtil#getFillColor/getStrokeColor):
    // the OMG non-normative `color:*` pair plus the legacy `bioc:*` one.
    static explicitlyColoredIdsOf(elementRegistry) {
        const ids = new Set();
        for (const element of elementRegistry.getAll()) {
            const di = element.di;
            if (!di || typeof di.get !== 'function') {
                continue;
            }
            const colored = di.get('color:background-color') || di.get('bioc:fill')
                || di.get('color:border-color') || di.get('bioc:stroke');
            if (colored) {
                ids.add(element.id);
            }
        }
        return ids;
    }
}
```

- [ ] **Step 4: Register the file in all three registries**

`src/core/utils.js#loadScripts` — after the `properties-group-expander.js` line:

```js
    await addScript('src/differ/bpmn/edit/edit-color-resolver.js', doc, getResourceUrlByNameFunc);
```

`manifest.json#web_accessible_resources.resources` — after
`"src/differ/bpmn/properties-group-expander.js"`:

```json
                "src/differ/bpmn/edit/edit-color-resolver.js",
```

`test/support/scope.js#SCOPE_FILES` — after
`'src/differ/bpmn/properties-group-expander.js'`:

```js
    'src/differ/bpmn/edit/edit-color-resolver.js',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/differ/bpmn/edit/edit-color-resolver.test.js`
Expected: PASS, all six cases.

- [ ] **Step 6: Verify the registries agree**

Run: `npm test`
Expected: PASS — including `test/structure/`, which checks the registries stay in
sync. If it reports a missing entry, fix the registry it names.

- [ ] **Step 7: Commit**

```bash
git add src/differ/bpmn/edit/edit-color-resolver.js manifest.json src/core/utils.js \
        test/support/scope.js test/differ/bpmn/edit/edit-color-resolver.test.js
git commit -m "feat(FEAT-0031): pure colour-layer resolver for edit mode"
```

---

### Task 4: `EditXmlColorizer` — write the diff colours into the exported XML

Pure string→string: takes the XML `saveXML()` produced and the resolver's map, and
writes the colours onto the `bpmndi` elements so the downloaded file looks in
Camunda Modeler / bpmn.io the way it looked on screen.

**Files:**
- Create: `src/differ/bpmn/edit/edit-xml-colorizer.js`
- Modify: `manifest.json`, `src/core/utils.js`, `test/support/scope.js`
- Test: `test/differ/bpmn/edit/edit-xml-colorizer.test.js`

**Interfaces:**
- Consumes: `EditColorResolver.resolve()`'s map shape from Task 3; the global
  `parseXml(xml)` helper from `src/core/utils.js`.
- Produces: `EditXmlColorizer.apply(xml, colorById)` → XML string.

- [ ] **Step 1: Write the failing test**

Create `test/differ/bpmn/edit/edit-xml-colorizer.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditXmlColorizer, DiffType } = createScope();

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Task_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="D_1">
    <bpmndi:BPMNPlane id="P_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1" />
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1" />
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const entry = (diffType, outlineOnly = false) => ({ diffType, outlineOnly });

describe('EditXmlColorizer', () => {
    it('fills a shape with the diff type shape colour, in both namespaces', () => {
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.match(out, /Task_1_di[^>]*color:background-color="#88ff88"/);
        assert.match(out, /Task_1_di[^>]*bioc:fill="#88ff88"/);
    });

    it('strokes an edge with the diff type row colour, in both namespaces', () => {
        // A connection shows its diff in the stroke, not the fill.
        const out = EditXmlColorizer.apply(XML, new Map([['Flow_1', entry(DiffType.CHANGE)]]));
        assert.match(out, /Flow_1_di[^>]*color:border-color="#0000aa"/);
        assert.match(out, /Flow_1_di[^>]*bioc:stroke="#0000aa"/);
    });

    it('declares both colour namespaces on the root', () => {
        // bpmn-js emits these declarations only when the MODEL carries such
        // attributes; we add them after the export, so we must declare them
        // ourselves or the file is not valid XML.
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.match(out, /xmlns:color="http:\/\/www\.omg\.org\/spec\/BPMN\/non-normative\/color\/1\.0"/);
        assert.match(out, /xmlns:bioc="http:\/\/bpmn\.io\/schema\/bpmn\/biocolor\/1\.0"/);
    });

    it('leaves an outline-only element alone', () => {
        // It already carries its own colour in the model; overwriting it here is
        // exactly the "user colour beats the diff colour" rule being broken.
        const out = EditXmlColorizer.apply(
            XML, new Map([['Task_1', entry(DiffType.ADD, true)]]));
        assert.doesNotMatch(out, /color:background-color/);
    });

    it('keeps the XML declaration that bpmn-js writes', () => {
        // XMLSerializer drops the prolog; losing it would change the very first
        // line of every downloaded file relative to the repo's other .bpmn files.
        const out = EditXmlColorizer.apply(XML, new Map([['Task_1', entry(DiffType.ADD)]]));
        assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    });

    it('returns the XML untouched for an empty map', () => {
        const out = EditXmlColorizer.apply(XML, new Map());
        assert.doesNotMatch(out, /color:background-color/);
        assert.doesNotMatch(out, /xmlns:color=/);
    });

    it('ignores ids with no bpmndi element', () => {
        // Assert the whole string, not the absence of a substring the fixture never
        // had: this pins down "nothing painted, so no namespace declarations either".
        const out = EditXmlColorizer.apply(XML, new Map([['Ghost_1', entry(DiffType.ADD)]]));
        assert.equal(out, XML);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/differ/bpmn/edit/edit-xml-colorizer.test.js`
Expected: FAIL — `EditXmlColorizer` is not defined by the scope.

- [ ] **Step 3: Implement**

Create `src/differ/bpmn/edit/edit-xml-colorizer.js`:

```js
// FEAT-0031, edit mode: writes the resolved diff colours into the XML that
// saveXML() produced, so the downloaded file looks the way the canvas looked.
//
// The colours are deliberately NOT in the model — painting them there would put
// colour commands on the user's undo stack (see the colour model in FEAT-0031) —
// so they are added here, after the export, as a pure string transform.
//
// bpmn-js writes both the OMG non-normative `color:*` attributes and the legacy
// `bioc:*` ones (SetColorHandler#ensureLegacySupport); Camunda Modeler and bpmn.io
// read that pair, so we write both too. Because the model never carried these
// attributes, bpmn-js also never emitted their namespace declarations — we add
// them ourselves, otherwise the prefixes are undeclared and the file is invalid.
class EditXmlColorizer {
    static COLOR_NS = 'http://www.omg.org/spec/BPMN/non-normative/color/1.0';
    static BIOC_NS = 'http://bpmn.io/schema/bpmn/biocolor/1.0';

    // xml: the string from saveXML(); colorById: the EditColorResolver map.
    // Entries flagged outlineOnly are skipped: that element already carries its
    // own colour in the model and it must win (it only gets a dashed outline on
    // screen, which is a screen-only affordance).
    static apply(xml, colorById) {
        if (!colorById || colorById.size === 0) {
            return xml;
        }
        const doc = parseXml(xml);
        const root = doc.documentElement;
        let painted = false;

        // The prefix is bpmn-js' own — this XML came straight out of saveXML().
        const diElements = [
            ...doc.getElementsByTagName('bpmndi:BPMNShape'),
            ...doc.getElementsByTagName('bpmndi:BPMNEdge')
        ];
        for (const di of diElements) {
            const entry = colorById.get(di.getAttribute('bpmnElement'));
            if (!entry || entry.outlineOnly) {
                continue;
            }
            if (di.tagName === 'bpmndi:BPMNEdge') {
                di.setAttribute('color:border-color', entry.diffType.rowColor);
                di.setAttribute('bioc:stroke', entry.diffType.rowColor);
            } else {
                di.setAttribute('color:background-color', entry.diffType.shapeColor);
                di.setAttribute('bioc:fill', entry.diffType.shapeColor);
            }
            painted = true;
        }

        if (!painted) {
            return xml;
        }
        root.setAttribute('xmlns:color', EditXmlColorizer.COLOR_NS);
        root.setAttribute('xmlns:bioc', EditXmlColorizer.BIOC_NS);
        // XMLSerializer never re-emits the XML declaration, but bpmn-js always
        // writes one — dropping it would make the downloaded file differ from every
        // other .bpmn in the repo on its very first line, and show up as a spurious
        // deletion if anyone commits it. Carry the original prolog over verbatim.
        const prolog = xml.match(/^\s*<\?xml[^>]*\?>\s*/);
        const serialized = new XMLSerializer().serializeToString(doc);
        return prolog ? prolog[0] + serialized : serialized;
    }
}
```

- [ ] **Step 4: Register the file in all three registries**

`src/core/utils.js#loadScripts`, after the resolver line:

```js
    await addScript('src/differ/bpmn/edit/edit-xml-colorizer.js', doc, getResourceUrlByNameFunc);
```

`manifest.json#web_accessible_resources.resources`, after the resolver entry:

```json
                "src/differ/bpmn/edit/edit-xml-colorizer.js",
```

`test/support/scope.js#SCOPE_FILES`, after the resolver entry:

```js
    'src/differ/bpmn/edit/edit-xml-colorizer.js',
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/differ/bpmn/edit/edit-xml-colorizer.test.js`
Expected: PASS, all six cases.

- [ ] **Step 6: Run the unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/differ/bpmn/edit/edit-xml-colorizer.js manifest.json src/core/utils.js \
        test/support/scope.js test/differ/bpmn/edit/edit-xml-colorizer.test.js
git commit -m "feat(FEAT-0031): pure XML colorizer for the edited file download"
```

---

### Task 5: `EditDiffPainter` — the display-only marker layer

Turns the resolver's map into canvas markers. Nothing it does reaches the model,
so it never touches the command stack.

**Files:**
- Create: `src/differ/bpmn/edit/edit-diff-painter.js`
- Modify: `src/differ/styles.css`
- Modify: `manifest.json`, `src/core/utils.js`, `test/support/scope.js`
- Test: `test/differ/bpmn/edit/edit-diff-painter.test.js`

**Interfaces:**
- Consumes: the map from `EditColorResolver.resolve()` (Task 3).
- Produces:
  - `new EditDiffPainter(canvas, elementRegistry)`
  - `EditDiffPainter#paint(colorById)` — clears the previous markers, applies the new
  - `EditDiffPainter#clear()`
  - marker classes `edit-diff-added`, `edit-diff-changed`, `edit-diff-outline`

- [ ] **Step 1: Write the failing test**

Create `test/differ/bpmn/edit/edit-diff-painter.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditDiffPainter, EditColorResolver, DiffType } = createScope();

// A canvas double that records the marker calls, mirroring diagram-js' API.
function fakeCanvas() {
    const markers = new Map();
    return {
        markers,
        addMarker(element, marker) {
            const id = element.id;
            if (!markers.has(id)) markers.set(id, new Set());
            markers.get(id).add(marker);
        },
        removeMarker(element, marker) {
            const set = markers.get(element.id);
            if (set) set.delete(marker);
        }
    };
}

const fakeRegistry = (ids) => ({
    get: (id) => (ids.includes(id) ? { id } : undefined)
});

describe('EditDiffPainter', () => {
    it('marks added and changed elements with their own classes', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A', 'B']));
        painter.paint(EditColorResolver.resolve([
            { ids: ['A'], diffType: DiffType.ADD },
            { ids: ['B'], diffType: DiffType.CHANGE }
        ]));
        assert.deepEqual([...canvas.markers.get('A')], ['edit-diff-added']);
        assert.deepEqual([...canvas.markers.get('B')], ['edit-diff-changed']);
    });

    it('adds the outline modifier for an explicitly coloured element', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve(
            [{ ids: ['A'], diffType: DiffType.ADD }], new Set(['A'])));
        assert.deepEqual(
            [...canvas.markers.get('A')].sort(), ['edit-diff-added', 'edit-diff-outline']);
    });

    it('removes the previous markers on repaint', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.ADD }]));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.CHANGE }]));
        assert.deepEqual([...canvas.markers.get('A')], ['edit-diff-changed']);
    });

    it('clears everything when painting an empty map (the toggle went off)', () => {
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry(['A']));
        painter.paint(EditColorResolver.resolve([{ ids: ['A'], diffType: DiffType.ADD }]));
        painter.paint(new Map());
        assert.equal(canvas.markers.get('A').size, 0);
    });

    it('skips ids that are no longer in the registry', () => {
        // An element deleted between the recompute and the paint.
        const canvas = fakeCanvas();
        const painter = new EditDiffPainter(canvas, fakeRegistry([]));
        painter.paint(EditColorResolver.resolve([{ ids: ['Gone'], diffType: DiffType.ADD }]));
        assert.equal(canvas.markers.size, 0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/differ/bpmn/edit/edit-diff-painter.test.js`
Expected: FAIL — `EditDiffPainter` is not defined by the scope.

- [ ] **Step 3: Implement**

Create `src/differ/bpmn/edit/edit-diff-painter.js`:

```js
// FEAT-0031, edit mode: paints the resolved colours as canvas markers.
//
// Markers, not modeling.setColor: setColor goes through the command stack, so
// recolouring after every edit would put a colour command between the user and
// their own change (the first Ctrl+Z would undo a colour) and would make
// commandStack.canUndo() useless as a dirty flag. Everything painted here lives
// in CSS only — see the .edit-diff-* rules in styles.css.
//
// Named edit-diff-* deliberately: highlight-diff* is a different concept (the ☼
// button's cyan attention outline in DiffHighlighter), and the two must not collide.
// A CSS fill also works on bpmn:TextAnnotation, which setColor does not.
class EditDiffPainter {
    static MARKER_BY_DIFF_NAME = new Map([
        ['added', 'edit-diff-added'],
        ['changed', 'edit-diff-changed'],
        ['removed', 'edit-diff-removed']
    ]);
    static OUTLINE_MARKER = 'edit-diff-outline';

    #canvas;
    #elementRegistry;
    // Ids currently carrying our markers, so a repaint can clear exactly those
    // (the previous colour map is the only thing that knows what we put there).
    #paintedIds = new Map();

    constructor(canvas, elementRegistry) {
        this.#canvas = canvas;
        this.#elementRegistry = elementRegistry;
    }

    // colorById: the EditColorResolver map. An empty map clears the layer, which
    // is what turning the "colour the edits" toggle off does.
    paint(colorById) {
        this.clear();
        for (const [id, entry] of colorById) {
            const element = this.#elementRegistry.get(id);
            const marker = EditDiffPainter.MARKER_BY_DIFF_NAME.get(entry.diffType.name);
            if (!element || !marker) {
                continue;
            }
            const markers = entry.outlineOnly
                ? [marker, EditDiffPainter.OUTLINE_MARKER]
                : [marker];
            for (const each of markers) {
                this.#addMarker(element, each);
            }
            this.#paintedIds.set(id, markers);
        }
    }

    clear() {
        for (const [id, markers] of this.#paintedIds) {
            const element = this.#elementRegistry.get(id);
            if (!element) {
                continue;
            }
            for (const marker of markers) {
                this.#removeMarker(element, marker);
            }
        }
        this.#paintedIds = new Map();
    }

    // diagram-js throws on elements without an id (labels, roots), same as
    // DiffHighlighter — swallow it rather than filtering the registry.
    #addMarker(element, marker) {
        try {
            this.#canvas.addMarker(element, marker);
        } catch (error) {
            // element cannot carry a marker; nothing to paint
        }
    }

    #removeMarker(element, marker) {
        try {
            this.#canvas.removeMarker(element, marker);
        } catch (error) {
            // element cannot carry a marker; nothing to clear
        }
    }
}
```

- [ ] **Step 4: Add the marker styles to `styles.css`**

Append, next to the existing `highlight-diff` rules:

```css
/* FEAT-0031 edit mode: the display-only diff colours. Deliberately CSS and not
   modeling.setColor — nothing here reaches the model or the command stack, which
   is what keeps Ctrl+Z the user's own and the dirty flag honest.
   Distinct from .highlight-diff* above: that is the ☼ button's attention outline.
   Shapes take the fill, connections take the stroke — mirroring DiffType's
   shapeColor / rowColor split. An element that already carries its own colour
   gets the dashed outline instead, so its colour survives (.edit-diff-outline). */
.djs-shape.edit-diff-added:not(.edit-diff-outline) .djs-visual > :first-child {
    fill: #88ff88 !important;
}
.djs-shape.edit-diff-changed:not(.edit-diff-outline) .djs-visual > :first-child {
    fill: #8888ff !important;
}
.djs-shape.edit-diff-removed:not(.edit-diff-outline) .djs-visual > :first-child {
    fill: #ff8888 !important;
}

.djs-connection.edit-diff-added:not(.edit-diff-outline) .djs-visual > :first-child {
    stroke: #00aa00 !important;
}
.djs-connection.edit-diff-changed:not(.edit-diff-outline) .djs-visual > :first-child {
    stroke: #0000aa !important;
}
.djs-connection.edit-diff-removed:not(.edit-diff-outline) .djs-visual > :first-child {
    stroke: #aa0000 !important;
}

.djs-element.edit-diff-outline .djs-outline {
    visibility: visible;
    stroke-width: 2px;
    stroke-dasharray: 4 3;
}
.djs-element.edit-diff-outline.edit-diff-added .djs-outline { stroke: #00aa00; }
.djs-element.edit-diff-outline.edit-diff-changed .djs-outline { stroke: #0000aa; }
.djs-element.edit-diff-outline.edit-diff-removed .djs-outline { stroke: #aa0000; }
```

- [ ] **Step 5: Register the file in all three registries**

`src/core/utils.js#loadScripts`, after the colorizer line:

```js
    await addScript('src/differ/bpmn/edit/edit-diff-painter.js', doc, getResourceUrlByNameFunc);
```

`manifest.json#web_accessible_resources.resources`, after the colorizer entry:

```json
                "src/differ/bpmn/edit/edit-diff-painter.js",
```

`test/support/scope.js#SCOPE_FILES`, after the colorizer entry:

```js
    'src/differ/bpmn/edit/edit-diff-painter.js',
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test test/differ/bpmn/edit/edit-diff-painter.test.js`
Expected: PASS, all five cases.

- [ ] **Step 7: Run the unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/differ/bpmn/edit/edit-diff-painter.js src/differ/styles.css manifest.json \
        src/core/utils.js test/support/scope.js test/differ/bpmn/edit/edit-diff-painter.test.js
git commit -m "feat(FEAT-0031): display-only marker layer for the edit diff"
```

---

### Task 6: `EditSession` — baseline, live recompute, dirty guard

The lifecycle piece: snapshot the baseline right after import, recompute the diff
on a debounce after every command, drive the painter and the properties-panel
highlighter, own the colouring toggle, and warn on close when dirty.

**Files:**
- Create: `src/differ/bpmn/edit/edit-session.js`
- Modify: `src/differ/bpmn/bpmn-differ.js`
- Modify: `manifest.json`, `src/core/utils.js`, `test/support/scope.js`
- Test: `test/differ/bpmn/edit/edit-session.test.js`
- Test: `test/e2e/differ-edit-markers.spec.js`

**Interfaces:**
- Consumes: `EditColorResolver` (Task 3), `EditDiffPainter` (Task 5), the global
  `BpmnXmlComparator`, `DiffType`.
- Produces:
  - `new EditSession({ modeler, comparator, painter, propertiesPanelHighlighter, fileName, onColoringPaused })`
  - `onColoringPaused(paused)` — called with `true` when a recompute cannot compare
    (see BUG-0029), with `false` on the next recompute that can
  - `EditSession#start()` — async; takes the baseline and subscribes
  - `EditSession#setMrDiff(diff, diffTypeForMissing)` — colour layer 3
  - `EditSession#setColoringEnabled(enabled)` → `boolean` (the new state)
  - `EditSession#isDirty()` → `boolean`
  - `EditSession#currentColorMap()` → the resolver map (Task 7's download reads it)
  - `EditSession.editedFileName(fileName, date)` → `string` (static, pure)
  - `EditSession.RECOMPUTE_DEBOUNCE_MS = 300`
  - `BpmnDifferView#setEditColoringPaused(paused)` — drives the toggle's `⚠` state

- [ ] **Step 1: Write the failing unit test**

Create `test/differ/bpmn/edit/edit-session.test.js`:

```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { EditSession } = createScope();

describe('EditSession.editedFileName', () => {
    it('inserts the local timestamp before the extension', () => {
        const name = EditSession.editedFileName(
            'order-process.bpmn', new Date(2026, 7, 21, 9, 5, 3));
        assert.equal(name, 'order-process-edited-20260821-090503.bpmn');
    });

    it('does not double the extension', () => {
        const name = EditSession.editedFileName('a.bpmn', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'a-edited-20260101-000000.bpmn');
    });

    it('appends the extension when the name has none', () => {
        const name = EditSession.editedFileName('a', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'a-edited-20260101-000000.bpmn');
    });

    it('matches the extension case-insensitively', () => {
        const name = EditSession.editedFileName('A.BPMN', new Date(2026, 0, 1, 0, 0, 0));
        assert.equal(name, 'A-edited-20260101-000000.bpmn');
    });
});

// A modeler double: enough of the bpmn-js injector surface for the session, with
// a hand-held commandStack.changed listener so a test can fire a recompute.
function fakeModeler({ xml = '<x/>', xmlQueue = null } = {}) {
    let listener = null;
    const painted = [];
    return {
        painted,
        fire: () => listener && listener(),
        saveXML: async () => ({ xml: xmlQueue && xmlQueue.length ? xmlQueue.shift() : xml }),
        get: (name) => ({
            eventBus: { on: (event, handler) => { if (event === 'commandStack.changed') listener = handler; } },
            commandStack: { canUndo: () => false },
            elementRegistry: { getAll: () => [] }
        }[name])
    };
}

const settle = () => new Promise((resolve) =>
    setTimeout(resolve, EditSession.RECOMPUTE_DEBOUNCE_MS + 150));

describe('EditSession recompute', () => {
    it('signals paused when the comparison throws and keeps the last colouring', async () => {
        // BUG-0029: compare() throws on a diagram with no executable process.
        const modeler = fakeModeler();
        const paintCalls = [];
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: { compare: () => { throw new TypeError('no executable process'); } },
            painter: { paint: (map) => paintCalls.push(map) },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            fileName: 'a.bpmn',
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();
        const paintsAfterStart = paintCalls.length;

        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true]);
        // No repaint: the previous colouring stands rather than flashing clean.
        assert.equal(paintCalls.length, paintsAfterStart);
    });

    it('clears the paused signal once the comparison succeeds again', async () => {
        const modeler = fakeModeler();
        let shouldThrow = true;
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: {
                compare: () => {
                    if (shouldThrow) throw new TypeError('no executable process');
                    return emptyDiff();
                }
            },
            painter: { paint: () => {} },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            fileName: 'a.bpmn',
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();

        modeler.fire();
        await settle();
        shouldThrow = false;
        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true, false]);
    });

    it('does not repeat the paused signal while the streak lasts', async () => {
        const modeler = fakeModeler();
        const paused = [];
        const session = new EditSession({
            modeler,
            comparator: { compare: () => { throw new TypeError('boom'); } },
            painter: { paint: () => {} },
            propertiesPanelHighlighter: { setDiffData: () => {} },
            fileName: 'a.bpmn',
            onColoringPaused: (value) => paused.push(value)
        });
        await session.start();

        modeler.fire();
        await settle();
        modeler.fire();
        await settle();

        assert.deepEqual(paused, [true]);
    });
});

function emptyDiff() {
    return {
        missingShapeIds: [], missingRowIds: [],
        changedShapeIds: [], changedRowIds: [],
        nodeIdToDiffsMap: new Map(),
        nodeIdToConditions: new Map(),
        nodeIdToMappingChanges: new Map()
    };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/differ/bpmn/edit/edit-session.test.js`
Expected: FAIL — `EditSession` is not defined by the scope.

- [ ] **Step 3: Implement `EditSession`**

Create `src/differ/bpmn/edit/edit-session.js`:

```js
// FEAT-0031: the lifecycle of one edit session.
//
// The baseline is the XML as saveXML() returns it IMMEDIATELY after the import,
// not the XML that was fetched: bpmn-js normalises attribute order, indentation
// and defaults on the round trip, and comparing against the fetched text would
// show that normalisation as phantom edits on an untouched diagram.
//
// From then on every command triggers a debounced recompute of
// compare(current, baseline) — added + changed — whose result becomes colour
// layer 2. Deletions are not painted in v1 (there is nothing left on the canvas
// to paint, and re-inserting a red ghost would put it into the downloaded file).
class EditSession {
    // Long enough to swallow a burst of commands (a drag emits several), short
    // enough that the colour follows the edit rather than trailing it.
    static RECOMPUTE_DEBOUNCE_MS = 300;

    #modeler;
    #comparator;
    #painter;
    #propertiesPanelHighlighter;
    #fileName;
    #onColoringPaused;

    #baselineXml = null;
    #coloringEnabled = true;
    #coloringPaused = false;
    #myLayers = [];
    #mrLayers = [];
    #colorById = new Map();
    #timeoutId = null;
    // Monotonic token: saveXML() is async while commandStack.changed is not, so
    // two recomputes can be in flight and finish out of order. Only the newest
    // one is allowed to paint.
    #recomputeToken = 0;

    constructor({ modeler, comparator, painter, propertiesPanelHighlighter, fileName,
                  onColoringPaused }) {
        this.#modeler = modeler;
        this.#comparator = comparator;
        this.#painter = painter;
        this.#propertiesPanelHighlighter = propertiesPanelHighlighter;
        this.#fileName = fileName;
        this.#onColoringPaused = onColoringPaused;
    }

    // Call after the edited side has been imported.
    async start() {
        const { xml } = await this.#modeler.saveXML();
        this.#baselineXml = xml;
        this.#modeler.get('eventBus').on('commandStack.changed', () => this.#scheduleRecompute());
        window.addEventListener('beforeunload', (event) => {
            if (!this.isDirty()) {
                return;
            }
            // The modern pair: preventDefault is what Chrome honours, returnValue
            // is kept for the browsers that still require it.
            event.preventDefault();
            event.returnValue = '';
        });
        this.#repaint();
    }

    // Colour layer 3: the MR diff of the side being edited, computed once by
    // BpmnDiffer before the session started. `diff` is a BpmnXmlComparator result.
    setMrDiff(diff, diffTypeForMissing) {
        this.#mrLayers = [
            { ids: [...diff.missingShapeIds, ...diff.missingRowIds], diffType: diffTypeForMissing },
            { ids: [...diff.changedShapeIds, ...diff.changedRowIds], diffType: DiffType.CHANGE }
        ];
        this.#repaint();
    }

    // The "colour the edits" toggle. Governs the screen and the export at once,
    // which is only honest because everything we paint is outside the model.
    setColoringEnabled(enabled) {
        this.#coloringEnabled = enabled;
        this.#repaint();
        return this.#coloringEnabled;
    }

    get coloringEnabled() {
        return this.#coloringEnabled;
    }

    // Nothing but the user's own actions ever reaches the command stack in edit
    // mode (the diff is markers, not setColor), so this is an honest dirty flag.
    isDirty() {
        return this.#modeler.get('commandStack').canUndo();
    }

    currentColorMap() {
        return this.#colorById;
    }

    async currentXml() {
        const { xml } = await this.#modeler.saveXML({ format: true });
        return xml;
    }

    // <name>-edited-<yyyyMMdd-HHmmss>.bpmn, in the user's local time — the stamp
    // is there to be read by a person, not to sort in UTC.
    static editedFileName(fileName, date = new Date()) {
        const pad = (value) => String(value).padStart(2, '0');
        const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
            + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
        const base = fileName.replace(/\.bpmn$/i, '');
        return `${base}-edited-${stamp}.bpmn`;
    }

    #scheduleRecompute() {
        clearTimeout(this.#timeoutId);
        this.#timeoutId = setTimeout(() => this.#recompute(), EditSession.RECOMPUTE_DEBOUNCE_MS);
    }

    async #recompute() {
        const token = ++this.#recomputeToken;
        const xml = await this.currentXml();
        if (token !== this.#recomputeToken) {
            return; // a newer recompute superseded this one
        }
        let diff;
        try {
            diff = this.#comparator.compare(xml, this.#baselineXml);
        } catch (error) {
            // BUG-0029: compare() requires a bpmn:process[isExecutable="true"] and
            // dereferences it straight away, so clearing "Executable" in the properties
            // panel throws here. Abort THIS recompute only — keep the last good
            // colouring rather than flashing the canvas clean on a state the user may
            // undo in a second — but say so in the toolbar, because the state can also
            // be permanent and a frozen-but-silent diff is worse than a stale one.
            if (!this.#coloringPaused) {
                // Once per streak: commands arrive in bursts and this would flood.
                console.warn('cannot compare the edited diagram against the baseline', error);
            }
            this.#setColoringPaused(true);
            return;
        }
        this.#setColoringPaused(false);
        this.#myLayers = [
            { ids: [...diff.missingShapeIds, ...diff.missingRowIds], diffType: DiffType.ADD },
            { ids: [...diff.changedShapeIds, ...diff.changedRowIds], diffType: DiffType.CHANGE }
        ];
        // The panel shows MY diff here, not the MR's — the groups the user changed.
        // PropertiesGroupExpander is deliberately NOT refreshed: re-opening groups
        // after every keystroke would move the panel under the user's hands.
        this.#propertiesPanelHighlighter.setDiffData(
            diff.nodeIdToDiffsMap, diff.nodeIdToConditions, diff.nodeIdToMappingChanges);
        this.#repaint();
    }

    #setColoringPaused(paused) {
        if (this.#coloringPaused === paused) {
            return;
        }
        this.#coloringPaused = paused;
        if (this.#onColoringPaused) {
            this.#onColoringPaused(paused);
        }
    }

    #repaint() {
        const layers = this.#coloringEnabled ? [...this.#myLayers, ...this.#mrLayers] : [];
        this.#colorById = EditColorResolver.resolve(
            layers, EditColorResolver.explicitlyColoredIdsOf(this.#modeler.get('elementRegistry')));
        this.#painter.paint(this.#colorById);
    }
}
```

- [ ] **Step 4: Wire it into `bpmn-differ.js`**

Add the field `#editSession = null;` with the other private fields.

In `show()`, after `this.#hideModelerPalleteAndPoweredByLabel();` construct the
session (it starts after the import, further down):

```js
        if (this.#isEditMode()) {
            this.#editSession = new EditSession({
                modeler: this.#bpmnJS,
                comparator: this.#xmlComparator,
                painter: new EditDiffPainter(bpmnJSCanvas, this.#elementRegistry),
                propertiesPanelHighlighter: this.#propertiesPanelHighlighter,
                fileName: this.#params.fileName,
                onColoringPaused: (paused) => this.#view.setEditColoringPaused(paused)
            });
        }
```

Guard `#paintDiffs` — its single entry point covers both `#showBranch` and
`#showMr`, so one guard is the whole change:

```js
    // Paints the diff onto the (already imported) canvas and fills the changes table.
    #paintDiffs(diff, diffTypeForMissing) {
        if (this.#editSession) {
            // FEAT-0031: in edit mode the MR diff becomes colour layer 3, painted as
            // markers. Nothing below may run here: DiffHighlighter.paint is
            // modeling.setColor (it would poison the undo stack and the dirty flag)
            // and there is no changes table to fill.
            this.#editSession.setMrDiff(diff, diffTypeForMissing);
            return;
        }
        ...
    }
```

Start the session right after the edited side is imported, in `show()`:

```js
        if (this.#editSession) {
            // The baseline must be taken from the freshly imported model, before the
            // user can touch anything.
            await this.#editSession.start();
        }
```

Place this immediately after the `#showBranch()`/`#showMr()` call added in Task 2,
before `this.#view.showCanvas();`.

Replace the Task 2 placeholder callback in `#init()`:

```js
            onToggleEditColoring: () => this.#editSession.setColoringEnabled(
                !this.#editSession.coloringEnabled),
```

- [ ] **Step 5: Register the file in all three registries**

`src/core/utils.js#loadScripts`, after the painter line:

```js
    await addScript('src/differ/bpmn/edit/edit-session.js', doc, getResourceUrlByNameFunc);
```

`manifest.json#web_accessible_resources.resources`, after the painter entry:

```json
                "src/differ/bpmn/edit/edit-session.js",
```

`test/support/scope.js#SCOPE_FILES`, after the painter entry:

```js
    'src/differ/bpmn/edit/edit-session.js',
```

- [ ] **Step 6: Write the failing e2e test**

Create `test/e2e/differ-edit-markers.spec.js`:

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

const COLORING_ON = 'Colour the edits — on';
const COLORING_OFF = 'Colour the edits — off';

// Rename a task through the properties panel and wait for the debounced recompute.
async function renameTask1(page, text) {
    await page.locator('svg .djs-element[data-element-id="Task_1"]').click();
    const generalHeader = page.locator('.bio-properties-panel-group-header', { hasText: 'General' });
    await expect(generalHeader).toBeVisible();
    if (!await generalHeader.evaluate((el) => el.classList.contains('open'))) {
        await generalHeader.click();
    }
    const nameInput = page.locator('#bio-properties-panel-name');
    await nameInput.click();
    await page.keyboard.type(text);
    await nameInput.blur();
}

// An untouched diagram must show NO edit markers: the baseline is the XML as
// saveXML() returns it right after the import, so bpmn-js' own normalisation does
// not read as a change (FEAT-0031).
test('a freshly opened editor shows no edit markers', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await expect(page.locator('.edit-diff-changed')).toHaveCount(0);
});

test('editing a name marks the element as changed', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await renameTask1(page, 'ZZZ');

    await expect(page.locator('svg .djs-element[data-element-id="Task_1"]'))
        .toHaveClass(/edit-diff-changed/, { timeout: 5000 });
});

test('the toggle clears and restores the edit colouring', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams({ sourceRef: 'mr-sha', targetRef: 'mr-sha' }) });

    await renameTask1(page, 'ZZZ');
    const task = page.locator('svg .djs-element[data-element-id="Task_1"]');
    await expect(task).toHaveClass(/edit-diff-changed/, { timeout: 5000 });

    await page.getByTitle(COLORING_ON).click();
    await expect(task).not.toHaveClass(/edit-diff-changed/);

    await page.getByTitle(COLORING_OFF).click();
    await expect(task).toHaveClass(/edit-diff-changed/);
});

// Opened from an MR diff, the editor also carries colour layer 3: the element the
// MR added is coloured before the user does anything.
test('the MR diff is painted as markers, not through setColor', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });

    // setColor would have pushed a command, so an untouched editor must be clean:
    // no beforeunload warning and nothing to undo.
    const canUndo = await page.evaluate(() => window.__bpmnDifferModeler
        ? window.__bpmnDifferModeler.get('commandStack').canUndo() : null);
    expect(canUndo === null || canUndo === false).toBe(true);
});
```

For the last assertion the modeler must be reachable from the page. Add one line
at the end of `BpmnDiffer#show()`, guarded so it only exists in edit mode:

```js
        if (this.#isEditMode()) {
            // Test seam (FEAT-0031): the e2e suite asserts the command stack is
            // untouched by our own painting. Edit mode only.
            window.__bpmnDifferModeler = this.#bpmnJS;
        }
```

- [ ] **Step 7: Run both test layers to verify they pass**

Run: `node --test test/differ/bpmn/edit/edit-session.test.js && npx playwright test test/e2e/differ-edit-markers.spec.js`
Expected: PASS. If the marker assertions time out, raise the timeout above
`EditSession.RECOMPUTE_DEBOUNCE_MS` rather than shortening the debounce.

- [ ] **Step 8: Run the full suites**

Run: `npm test && npx playwright test`
Expected: PASS, `differ-view-only.spec.js` included.

- [ ] **Step 9: Commit**

```bash
git add src/differ/bpmn/edit/edit-session.js src/differ/bpmn/bpmn-differ.js manifest.json \
        src/core/utils.js test/support/scope.js \
        test/differ/bpmn/edit/edit-session.test.js test/e2e/differ-edit-markers.spec.js
git commit -m "feat(FEAT-0031): edit session with baseline, live diff and dirty guard"
```

---

### Task 7: Colour control, download, and the docs

The last two user-facing pieces — the manual colour swatches and the download of
the coloured `.bpmn` — plus the architecture doc and the task's work log.

**Files:**
- Create: `src/differ/bpmn/edit/edit-color-control.js`
- Modify: `src/core/utils.js` (extract `downloadTextFile`)
- Modify: `src/differ/shared/diagram-versions.js` (use it)
- Modify: `src/differ/bpmn/bpmn-differ.js`, `src/differ/bpmn/bpmn-differ-view.js`
- Modify: `src/differ/styles.css`
- Modify: `manifest.json`, `test/structure/source-layout.test.js`
- Modify: `docs/architecture.md`, `docs/issues/features/feat-0031-bpmn-edit-mode.md`
- Test: `test/e2e/differ-edit-download.spec.js`

**Interfaces:**
- Consumes: `EditSession#currentXml()`, `#currentColorMap()`, `EditSession.editedFileName()`
  (Task 6); `EditXmlColorizer.apply()` (Task 4).
- Produces:
  - `downloadTextFile(content, fileName)` in `src/core/utils.js`
  - `new EditColorControl(modeling, selection)`
  - `EditColorControl#createElement()` → `HTMLElement`
  - `EditColorControl.SWATCHES` — `[{ label, fill, stroke } | { label, clear: true }]`

- [ ] **Step 1: Write the failing e2e test**

Create `test/e2e/differ-edit-download.spec.js`:

```js
'use strict';

const { test, expect } = require('@playwright/test');
const { bootBpmnDiffer, wireDiagnostics, defaultBpmnParams } = require('./support/boot-differ');

const editParams = (overrides = {}) =>
    defaultBpmnParams({ mode: 'edit', editSide: 'source', ...overrides });

const DOWNLOAD_TITLE = 'Download the edited .bpmn';
const COLORING_ON = 'Colour the edits — on';

async function downloadedText(page) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTitle(DOWNLOAD_TITLE).click()
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { name: download.suggestedFilename(), xml: Buffer.concat(chunks).toString('utf8') };
}

test('the downloaded file is named <name>-edited-<stamp>.bpmn', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    const { name } = await downloadedText(page);
    expect(name).toMatch(/^diagram-edited-\d{8}-\d{6}\.bpmn$/);
});

test('the downloaded XML carries the edit and the diff colours', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    // Task_2 is what the MR added over base — colour layer 3, green.
    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });

    const { xml } = await downloadedText(page);
    expect(xml).toMatch(/xmlns:color="http:\/\/www\.omg\.org\/spec\/BPMN\/non-normative\/color\/1\.0"/);
    expect(xml).toMatch(/bpmnElement="Task_2"[^>]*color:background-color="#88ff88"/);
});

test('with the colouring toggled off the file carries no diff colours', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await expect(page.locator('svg .djs-element[data-element-id="Task_2"]'))
        .toHaveClass(/edit-diff-added/, { timeout: 5000 });
    await page.getByTitle(COLORING_ON).click();

    const { xml } = await downloadedText(page);
    expect(xml).not.toMatch(/color:background-color/);
    expect(xml).not.toMatch(/xmlns:color=/);
});

test('a manually coloured element keeps its colour in the file', async ({ page }) => {
    wireDiagnostics(page);
    await bootBpmnDiffer(page, { params: editParams() });

    await page.locator('svg .djs-element[data-element-id="Task_2"]').click();
    await page.getByTitle('Colour the selection red').click();

    const { xml } = await downloadedText(page);
    // The user's colour is in the MODEL, so bpmn-js exports it itself; the diff
    // colour must not have overwritten it (Task_2 is outline-only now).
    // Attribute order is bpmn-moddle's choice for a colour it serializes itself,
    // so match on the values: Task_2 is the only added element in this fixture, so
    // the absence of the ADD green is enough to prove the diff colour stood down.
    expect(xml).toContain('#ffcdd2');
    expect(xml).not.toContain('#88ff88');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test test/e2e/differ-edit-download.spec.js`
Expected: FAIL — no "Download the edited .bpmn" button, no colour swatches.

- [ ] **Step 3: Extract the download helper**

In `src/core/utils.js`, next to `openDiffer`:

```js
// Hands the user a text file to save. Extracted from DiagramVersions.download so
// the FEAT-0031 edit download can supply a verbatim file name (the version
// download always prefixes the branch label).
function downloadTextFile(content, fileName) {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}
```

In `src/differ/shared/diagram-versions.js`, replace the body of `download` below
the `alert` guard with:

```js
        downloadTextFile(fileContent, `${branchName}-${fileName}`);
```

- [ ] **Step 4: Implement `EditColorControl`**

Create `src/differ/bpmn/edit/edit-color-control.js`:

```js
// FEAT-0031: the manual colour swatches in the edit toolbar.
//
// Unlike the automatic diff colouring (markers, outside the model), a colour set
// here goes INTO the model via modeling.setColor — that is the point: it is the
// user's own edit, it belongs on the undo stack and it must reach the downloaded
// file. It therefore also outranks the diff colour, which the resolver handles for
// free by reading the model each recompute; "Default" clears the colour and the
// diff colour comes back with no bookkeeping on this side.
//
// Note modeling.setColor does not work on bpmn:TextAnnotation (a bpmn-js
// limitation the viewer works around by patching the DOM); the automatic diff
// colour is unaffected, since it never goes through setColor.
class EditColorControl {
    // Deliberately few and far apart: this is review shorthand, not a palette.
    // The three diff colours are excluded so a manual colour never reads as one.
    static SWATCHES = [
        { label: 'red', fill: '#ffcdd2', stroke: '#c62828' },
        { label: 'yellow', fill: '#fff9c4', stroke: '#f9a825' },
        { label: 'grey', fill: '#eeeeee', stroke: '#616161' },
        { label: 'default', clear: true }
    ];

    #modeling;
    #selection;

    // No onChanged callback: setColor is a command, so the EditSession's own
    // commandStack.changed listener already schedules the repaint.
    constructor(modeling, selection) {
        this.#modeling = modeling;
        this.#selection = selection;
    }

    createElement() {
        const row = document.createElement('span');
        row.className = 'edit-color-swatches';
        for (const swatch of EditColorControl.SWATCHES) {
            row.appendChild(this.#createSwatch(swatch));
        }
        return row;
    }

    #createSwatch(swatch) {
        const button = document.createElement('button');
        button.className = 'edit-color-swatch'
            + (swatch.clear ? ' edit-color-swatch-clear' : '');
        button.title = swatch.clear
            ? 'Reset the selection to the default colour'
            : `Colour the selection ${swatch.label}`;
        if (!swatch.clear) {
            button.style.backgroundColor = swatch.fill;
            button.style.borderColor = swatch.stroke;
        }
        button.addEventListener('click', () => this.#apply(swatch));
        return button;
    }

    #apply(swatch) {
        const elements = this.#selection.get();
        if (elements.length === 0) {
            return;
        }
        // setColor with undefined removes the colour attributes entirely, which is
        // what "Default" must do — an explicit white would still count as an
        // explicit colour and keep suppressing the diff fill.
        this.#modeling.setColor(elements, swatch.clear
            ? { fill: undefined, stroke: undefined }
            : { fill: swatch.fill, stroke: swatch.stroke });
    }
}
```

Add the swatch styles to `src/differ/styles.css`:

```css
/* FEAT-0031: the manual colour swatches in the edit toolbar (UX-0007 sizing). */
.edit-color-swatches {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 4px;
}
.edit-color-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 2px solid #999;
    border-radius: 4px;
    cursor: pointer;
    background: #fff;
}
.edit-color-swatch-clear {
    background:
        linear-gradient(to top right,
            transparent calc(50% - 1px), #c62828 50%, transparent calc(50% + 1px));
}
```

- [ ] **Step 5: Wire the control and the download into the differ**

`bpmn-differ-view.js` — in edit mode the file group's `↓` becomes the edit
download, so the bar never carries two of them. Replace the download button
construction with:

```js
        this.#downloadButton = this.#button({
            icon: '↓',
            title: this.#isEditMode()
                ? 'Download the edited .bpmn'
                : 'Download the file as shown for the current branch',
            onClick: () => this.#callbacks.onDownload()
        });
```

`bpmn-differ.js` — route the download and mount the swatches. Replace the
`onDownload` callback in `#init()`:

```js
            onDownload: () => this.#isEditMode()
                ? this.#downloadEditedFile()
                : this.#downloadShownBranchFile(),
```

Add next to `#downloadShownBranchFile()`:

```js
    // FEAT-0031: export the edited model and re-apply the diff colours onto the
    // XML string. They are not in the model on purpose (see EditDiffPainter), so
    // this is where they enter the file — and where the "colour the edits" toggle
    // decides whether they do, since it governs the very map used here.
    async #downloadEditedFile() {
        const xml = await this.#editSession.currentXml();
        const colored = EditXmlColorizer.apply(xml, this.#editSession.currentColorMap());
        downloadTextFile(colored, EditSession.editedFileName(this.#params.fileName));
    }
```

Mount the swatches after `this.#view.build()` in `show()`, once the modeler exists
(place it right after the `EditSession` construction added in Task 6):

```js
        if (this.#isEditMode()) {
            // A manual colour changes which elements count as "explicitly coloured",
            // so the diff layer must be re-resolved — setColor is a command, so the
            // session's own commandStack.changed listener already does it.
            const colorControl = new EditColorControl(bpmnJSModeling, this.#selection);
            this.#view.editGroup.appendChild(colorControl.createElement());
        }
```

- [ ] **Step 6: Register the file in all three registries**

`src/core/utils.js#loadScripts`, after the session line:

```js
    await addScript('src/differ/bpmn/edit/edit-color-control.js', doc, getResourceUrlByNameFunc);
```

`manifest.json#web_accessible_resources.resources`, after the session entry:

```json
                "src/differ/bpmn/edit/edit-color-control.js",
```

**Not** added to `test/support/scope.js#SCOPE_FILES`: nothing unit-tests it, and
`registries.test.js` requires only that SCOPE_FILES entries exist, not that every
file be listed.

`test/structure/source-layout.test.js` requires a mirror test for every `src/`
file or an explicit entry in `UNTESTED_BY_DESIGN`. This one is DOM + `setColor`
glue with no logic worth a jsdom harness — the same category as `search-panel.js`
and `changes-table-view.js`, whose e2e coverage carries them. Add it under the
existing `// orchestrators / DOM+lib glue` heading, keeping the list's ordering:

```js
    'src/differ/bpmn/edit/edit-color-control.js',
```

- [ ] **Step 7: Run the download e2e to verify it passes**

Run: `npx playwright test test/e2e/differ-edit-download.spec.js`
Expected: PASS, all four cases.

- [ ] **Step 8: Run everything**

Run: `npm test && npx playwright test`
Expected: PASS — the whole unit suite and the whole e2e suite, including
`differ-view-only.spec.js` and `differ-download.spec.js` (the extraction in Step 3
must not have changed the version download's file name).

- [ ] **Step 9: Update the docs**

In `docs/architecture.md`, add the new level under `src/differ/bpmn/` in the
directory layout and the key-files table:

```
      edit/          # FEAT-0031 edit mode: session lifecycle, marker layer,
                     # colour control, and the two pure colour helpers
```

Add the five files to the key-files table with one-line purposes matching the
FEAT-0031 "Files" section.

In `docs/issues/features/feat-0031-bpmn-edit-mode.md` set `status: done` and add
the work-log entry at the top of the `## Work log` section, following
`docs/issues/README.md`:

```markdown
### 2026-08-21 · <model-id> · `<short-sha>` (branch `feature/feat-0031-bpmn-edit-mode`)

Implemented edit mode end to end: mode/editSide params and the edit identity key,
the four BUG-0011/0014/0015 mutes gated by mode, the marker-based colour layer
(resolver + painter + styles), the edit session (baseline, debounced recompute,
dirty guard), the colour control and the coloured download. Unit + e2e green.
```

Then move the file to `docs/issues/archive/features/` with `git mv`, as
`docs/issues/README.md` rule 3 requires.

- [ ] **Step 10: Commit**

```bash
git add src/differ/bpmn/edit/edit-color-control.js src/core/utils.js \
        src/differ/shared/diagram-versions.js src/differ/bpmn/bpmn-differ.js \
        src/differ/bpmn/bpmn-differ-view.js src/differ/styles.css manifest.json \
        test/structure/source-layout.test.js test/e2e/differ-edit-download.spec.js \
        docs/architecture.md docs/issues
git commit -m "feat(FEAT-0031): colour control and coloured .bpmn download"
```

---

## Notes for the executor

- **Do not push.** The repository has no reachable remote; the task ends at local
  commits on the feature branch (`docs/git-workflow.md`).
- **If `differ-view-only.spec.js` ever fails**, stop and fix the mode gating before
  continuing. That spec is the only thing standing between this feature and a
  regression of three shipped bug fixes.
- **The `window.__bpmnDifferModeler` seam** added in Task 6 is edit-mode-only and
  exists for one assertion. If you find another way to prove the command stack is
  untouched, drop it.
- **One deliberate deviation from the spec's test list:** FEAT-0031 asks for a
  jsdom unit test of "the toolbar group in edit mode". `differ-edit-boot.spec.js`
  already asserts that composition against the real DOM (`✎` present in view mode
  and absent in edit mode, no "Switch branch", no changes table), so a jsdom
  duplicate would only re-test the same branches more weakly. Not written on
  purpose — add it if the toolbar grows logic the e2e cannot reach.

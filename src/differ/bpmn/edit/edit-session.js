// FEAT-0031: the lifecycle of one edit session.
//
// The baseline is the XML as currentXml() returns it IMMEDIATELY after the
// import, not the XML that was fetched: bpmn-js normalises attribute order,
// indentation and defaults on the round trip, and comparing against the fetched
// text would show that normalisation as phantom edits on an untouched diagram.
// It goes through currentXml() rather than saveXML() directly so the baseline
// and every recompute share ONE serialisation: the comparator walks child nodes
// positionally, so the whitespace a formatted export adds inside
// extensionElements reads as a change on every element that has such children.
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
    #onColoringPaused;
    #onDiffUpdated;

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

    constructor({ modeler, comparator, painter, propertiesPanelHighlighter,
                  onColoringPaused, onDiffUpdated }) {
        this.#modeler = modeler;
        this.#comparator = comparator;
        this.#painter = painter;
        this.#propertiesPanelHighlighter = propertiesPanelHighlighter;
        this.#onColoringPaused = onColoringPaused;
        this.#onDiffUpdated = onDiffUpdated;
    }

    // Call after the edited side has been imported.
    async start() {
        this.#baselineXml = await this.currentXml();
        this.#modeler.get('eventBus').on('commandStack.changed', () => {
            // A manual colour click (modeling.setColor) needs no diff recompute, only
            // the outlineOnly bookkeeping — and that is cheap and synchronous
            // (explicitlyColoredIdsOf reads the model directly), so repaint eagerly
            // on every command instead of waiting for the debounced diff recompute
            // below. Otherwise a download right after a colour click would race the
            // debounce and export the stale, pre-colour map.
            this.#repaint();
            this.#scheduleRecompute();
        });
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
        // The panel repaints itself only on selection.changed, so without this the
        // colouring of the selected element freezes at the previous diff until the
        // user clicks elsewhere — most visibly on undo/redo, which changes the model
        // without changing the selection.
        if (this.#onDiffUpdated) {
            this.#onDiffUpdated();
        }
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

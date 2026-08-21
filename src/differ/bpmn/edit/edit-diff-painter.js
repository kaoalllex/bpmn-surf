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

// Paints diff colors on the diagram and manages highlight markers of diff elements
class DiffHighlighter {
    static HIGHLIGHTING_MARKER = 'highlight-diff';
    static BIG_HIGHLIGHTING_MARKER = 'highlight-diff-big';

    #canvas;
    #elementRegistry;
    #modeling;
    #enabled = false;
    #timeoutId = null;
    #diffElementIds = [];

    constructor(canvas, elementRegistry, modeling) {
        this.#canvas = canvas;
        this.#elementRegistry = elementRegistry;
        this.#modeling = modeling;
    }

    get enabled() {
        return this.#enabled;
    }

    setDiffElementIds(elementIds) {
        this.#diffElementIds = elementIds;
    }

    paint(diffType, shapeIdList, rowIdList) {
        if (shapeIdList.length > 0) {
            const shapes = shapeIdList
                .map(id => this.#elementRegistry.get(id))
                .filter(item => item);
            this.#modeling.setColor(shapes, { fill: diffType.shapeColor });

            // Paint the TextAnnotation elements because setColor() does not work for them
            for (const shape of shapes) {
                try {
                    if (shape.type === 'bpmn:TextAnnotation') {
                        document
                            .querySelector(`[data-element-id="${shape.id}"]`)
                            .querySelector('.djs-visual')
                            .querySelector('rect')
                            .style.fill = diffType.shapeColor;
                    }
                } catch (error) {
                    // Maybe the shape does not have the type property
                    // or the element to set the style cannot be found
                    // so, ignore it
                }
            }
        }
        if (rowIdList.length > 0) {
            const rows = rowIdList
                .map(id => this.#elementRegistry.get(id))
                .filter(item => item);
            this.#modeling.setColor(rows, { stroke: diffType.rowColor });
        }
    }

    setEnabled(enabled) {
        this.#enabled = enabled;
        // console.debug('highlighting enabled = ' + enabled);
        const elems = this.#getElementsForHighlighting();

        if (this.#enabled) {
            elems.forEach(elem => {
                // If elem is selected, highlighting does not work
                // so remove 'selected' marker
                this.removeMarker(elem, 'selected');
                this.addMarker(elem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
            });
            this.#timeoutId = setTimeout(() => {
                elems.forEach(elem => {
                    this.removeMarker(elem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
                    this.addMarker(elem, DiffHighlighter.HIGHLIGHTING_MARKER);
                });
            }, 2000);
        } else {
            if (this.#timeoutId) {
                clearTimeout(this.#timeoutId);
            }
            elems.forEach(elem => {
                this.removeMarker(elem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
                this.removeMarker(elem, DiffHighlighter.HIGHLIGHTING_MARKER);
            });
        }
    }

    applyIfEnabled() {
        if (!this.#enabled) {
            return;
        }

        const elems = this.#getElementsForHighlighting();
        elems.forEach(elem => this.addMarker(elem, DiffHighlighter.HIGHLIGHTING_MARKER));
    }

    addMarker(element, marker) {
        try {
            this.#canvas.addMarker(element, marker);
        } catch (error) {
            // Some elements do not have property `id`, so addMarker() throws error
        }
    }

    removeMarker(element, marker) {
        try {
            this.#canvas.removeMarker(element, marker);
        } catch (error) {
            // Some elements do not have property `id`, so removeMarker() throws error
        }
    }

    #getElementsForHighlighting() {
        return this.#diffElementIds
            .map(id => this.#elementRegistry.get(id))
            .filter(elem => elem && elem.type !== 'bpmn:Association');
    }
}

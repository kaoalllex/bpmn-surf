// FEAT-0031: the manual colour swatches — in the edit toolbar and on the context
// pad, where anyone coming from Camunda Modeler looks for them first.
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
    // The bpmn-js-color-picker palette (what Camunda Modeler offers), so a colour
    // set here matches what the same diagram gets in the modeler people already
    // use. Blue and green overlap the diff hues on purpose-by-request: a manual
    // colour lives in the MODEL, so the resolver marks that element outlineOnly
    // and its diff shows as a dashed outline instead of a fill — that, plus the
    // pastel tone, is what tells "I coloured this" from "this changed".
    static SWATCHES = [
        { label: 'blue', fill: '#bbdefb', stroke: '#0d4372' },
        { label: 'orange', fill: '#ffe0b2', stroke: '#6b3c00' },
        { label: 'green', fill: '#c8e6c9', stroke: '#205022' },
        { label: 'red', fill: '#ffcdd2', stroke: '#831311' },
        { label: 'purple', fill: '#e1bee7', stroke: '#5b176d' },
        { label: 'default', clear: true }
    ];

    #modeling;
    #selection;
    #buttons = [];
    #popup = null;

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
            const button = this.#createSwatch(swatch);
            this.#buttons.push(button);
            row.appendChild(button);
        }
        return row;
    }

    // A swatch does nothing without a selection, so it says so rather than
    // swallowing the click. The initial state comes from the empty
    // selection.changed bpmn-js emits on boot (BpmnDiffer wires it).
    setEnabled(enabled) {
        for (const button of this.#buttons) {
            button.disabled = !enabled;
        }
    }

    // The same swatches on the context pad. Our provider is registered after the
    // built-in one, so it receives the finished entries and adds to them.
    registerContextPad(contextPad) {
        contextPad.registerProvider({
            getContextPadEntries: () => (entries) => {
                entries['set-color'] = {
                    group: 'edit',
                    className: 'edit-color-pad-entry',
                    title: 'Set colour',
                    action: { click: (event, element) => this.#togglePopup(event, element) }
                };
                return entries;
            }
        });
    }

    #createSwatch(swatch, elements = null) {
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
        button.addEventListener('click', () => {
            this.#apply(swatch, elements);
            this.#closePopup();
        });
        return button;
    }

    #togglePopup(event, element) {
        if (this.#popup) {
            this.#closePopup();
            return;
        }
        const popup = document.createElement('div');
        popup.className = 'edit-color-popup';
        for (const swatch of EditColorControl.SWATCHES) {
            popup.appendChild(this.#createSwatch(swatch, [element]));
        }
        // Anchored to the pad entry that opened it, so it follows the pad around
        // the canvas; fixed positioning keeps it out of the canvas transform.
        const anchor = event.target && event.target.getBoundingClientRect
            ? event.target.getBoundingClientRect()
            : { left: event.clientX || 0, bottom: event.clientY || 0 };
        popup.style.left = anchor.left + 'px';
        popup.style.top = (anchor.bottom + 6) + 'px';
        document.body.appendChild(popup);
        this.#popup = popup;
        document.addEventListener('mousedown', this.#onOutsideClick, true);
        document.addEventListener('keydown', this.#onKeyDown, true);
    }

    #closePopup() {
        if (!this.#popup) {
            return;
        }
        this.#popup.remove();
        this.#popup = null;
        document.removeEventListener('mousedown', this.#onOutsideClick, true);
        document.removeEventListener('keydown', this.#onKeyDown, true);
    }

    #onOutsideClick = (event) => {
        if (this.#popup && !this.#popup.contains(event.target)) {
            this.#closePopup();
        }
    };

    #onKeyDown = (event) => {
        if (event.key === 'Escape') {
            this.#closePopup();
        }
    };

    #apply(swatch, elements = null) {
        const targets = elements || this.#selection.get();
        if (targets.length === 0) {
            return;
        }
        // setColor with undefined removes the colour attributes entirely, which is
        // what "Default" must do — an explicit white would still count as an
        // explicit colour and keep suppressing the diff fill.
        this.#modeling.setColor(targets, swatch.clear
            ? { fill: undefined, stroke: undefined }
            : { fill: swatch.fill, stroke: swatch.stroke });
    }
}

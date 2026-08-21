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

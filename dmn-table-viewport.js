// Zoom, fit and scroll of the dmn-js decision table viewport
class DmnTableViewport {
    static MIN_ZOOM = 10;
    static MAX_ZOOM = 300;

    #currentZoom = null;
    #tableContainer = null;
    #table = null;

    get scrollTop() {
        return this.#tableContainer ? this.#tableContainer.scrollTop : 0;
    }

    set scrollTop(value) {
        this.#tableContainer.scrollTop = value;
    }

    // Forget the table DOM elements, e.g. before re-importing the XML
    reset() {
        this.#tableContainer = null;
        this.#table = null;
    }

    fit() {
        if (!this.#tableContainer) {
            const container = document.getElementsByClassName('tjs-container')[0];
            container.style.width = window.innerWidth - 10;
            container.style.height = window.innerHeight - 40;

            this.#tableContainer = container.getElementsByClassName('tjs-table-container')[0];
            this.#tableContainer.style.overflow = 'scroll';

            this.#table = this.#tableContainer.getElementsByClassName('tjs-table')[0];
            this.#table.style.width = '100%';
            this.#table.style.height = '100%';

            this.#tableContainer.addEventListener('wheel', (event) => this.#handleWheelEvent(event));
        }
        if (!this.#currentZoom) {
            this.#currentZoom = 100;
        }
        this.setZoom(this.#currentZoom);
    }

    zoomIn() {
        this.#changeZoom(CanvasViewport.IN_OUT_ZOOM_DELTA);
    }

    zoomOut() {
        this.#changeZoom(-CanvasViewport.IN_OUT_ZOOM_DELTA);
    }

    showFull() {
        this.setZoom(DmnTableViewport.MAX_ZOOM);

        while (!this.#isFullyVisible()) {
            this.#changeZoom(-CanvasViewport.IN_OUT_ZOOM_DELTA);
        }
    }

    setZoom(zoom) {
        this.#tableContainer.style.zoom = zoom + '%';
        this.#currentZoom = zoom;
        // console.debug('new zoom = ' + zoom);
    }

    #changeZoom(delta) {
        // console.debug('current zoom = ' + this.#currentZoom + '; delta = ' + delta);
        let newZoom = Math.round(this.#currentZoom * (1 + delta));

        if (newZoom < DmnTableViewport.MIN_ZOOM) {
            // console.debug('min');
            newZoom = DmnTableViewport.MIN_ZOOM;
        }
        else if (newZoom > DmnTableViewport.MAX_ZOOM) {
            // console.debug('max');
            newZoom = DmnTableViewport.MAX_ZOOM;
        }

        this.setZoom(newZoom);
    }

    #isFullyVisible() {
        const containerHeight = this.#tableContainer.getBoundingClientRect().height;
        const tableHeight = this.#table.getBoundingClientRect().height;
        const res = tableHeight <= containerHeight;
        // console.debug('isFullyVisible = ' + res);
        return res;
    }

    #handleWheelEvent(event) {
        if (event.ctrlKey) {
            const delta = event.deltaY > 0 ? -CanvasViewport.WHEEL_ZOOM_DELTA : CanvasViewport.WHEEL_ZOOM_DELTA;
            this.#changeZoom(delta);
            event.preventDefault();
        }
    }
}

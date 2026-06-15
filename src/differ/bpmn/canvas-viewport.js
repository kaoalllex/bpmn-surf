// Pan, zoom and fit of the bpmn-js canvas viewport
class CanvasViewport {
    static MIN_ZOOM = 0.1;
    static MAX_ZOOM = 3.0;
    static IN_OUT_ZOOM_DELTA = 0.15;
    static WHEEL_ZOOM_DELTA = 0.03;

    #canvasElem;
    #bpmnCanvas = null;
    #mousePosition = null;

    constructor(canvasElem) {
        this.#canvasElem = canvasElem;
        canvasElem.addEventListener('mousedown', (event) => this.#handleMouseDown(event));
        canvasElem.addEventListener('mouseup', (event) => this.#handleMouseUp(event));
        canvasElem.addEventListener('mousemove', (event) => this.#handleMouseMove(event));
        canvasElem.addEventListener('wheel', (event) => this.#handleWheelEvent(event));
    }

    setBpmnCanvas(bpmnCanvas) {
        this.#bpmnCanvas = bpmnCanvas;
    }

    zoomIn() {
        this.changeZoom(CanvasViewport.IN_OUT_ZOOM_DELTA);
    }

    zoomOut() {
        this.changeZoom(-CanvasViewport.IN_OUT_ZOOM_DELTA);
    }

    changeZoom(delta) {
        const currentZoom = this.#bpmnCanvas.zoom();
        let newZoom = currentZoom + delta;
        if (newZoom < CanvasViewport.MIN_ZOOM) {
            newZoom = CanvasViewport.MIN_ZOOM;
        }
        else if (newZoom > CanvasViewport.MAX_ZOOM) {
            newZoom = CanvasViewport.MAX_ZOOM;
        }
        this.#bpmnCanvas.zoom(newZoom);
    }

    fit(force = false) {
        const viewbox = this.#bpmnCanvas.viewbox();
        const needToFit = viewbox.inner.width > viewbox.outer.width;

        if (needToFit && !this.#isAlreadyFitted() || force) {
            this.#bpmnCanvas.zoom('fit-viewport');
            if (needToFit) {
                const deltaY = 100 * this.#bpmnCanvas.zoom() - 20;
                this.#bpmnCanvas.scroll({ dy: deltaY });
                this.changeZoom(-0.005);
            }
        }
        this.#canvasElem.setAttribute('fitted', 'true');
    }

    #isAlreadyFitted() {
        return this.#canvasElem.hasAttribute('fitted');
    }

    #handleMouseDown(event) {
        if (event.button === 0) {
            this.#mousePosition = {
                x: event.clientX,
                y: event.clientY
            };
        }
    }

    #handleMouseUp(event) {
        if (event.button === 0) {
            this.#mousePosition = null;
        }
    }

    #handleMouseMove(event) {
        if (this.#mousePosition !== null) {
            const deltaX = event.clientX - this.#mousePosition.x;
            const deltaY = event.clientY - this.#mousePosition.y;
            this.#bpmnCanvas.scroll({ dx: deltaX, dy: deltaY });

            this.#mousePosition = {
                x: event.clientX,
                y: event.clientY
            };
        }
    }

    #handleWheelEvent(event) {
        if (event.ctrlKey) {
            const delta = event.deltaY > 0 ? -CanvasViewport.WHEEL_ZOOM_DELTA : CanvasViewport.WHEEL_ZOOM_DELTA;
            this.changeZoom(delta);
            event.preventDefault();
        }
    }
}

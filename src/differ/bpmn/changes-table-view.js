// List of changed/added/removed elements in the footer of the differ page
class ChangesTableView {
    static #CHANGE_GLYPHS = new Map([
        [DiffType.ADD.name, '+'],
        [DiffType.CHANGE.name, '~'],
        [DiffType.REMOVE.name, '−']
    ]);

    // Types whose bpmn-font icon name is not the kebab-cased type
    static #TYPE_ICON_NAMES = new Map([
        ['ExclusiveGateway', 'gateway-xor'],
        ['InclusiveGateway', 'gateway-or'],
        ['ParallelGateway', 'gateway-parallel'],
        ['EventBasedGateway', 'gateway-eventbased'],
        ['ComplexGateway', 'gateway-complex'],
        ['AdHocSubProcess', 'ad-hoc-subprocess'],
        ['SequenceFlow', 'connection'],
        ['MessageFlow', 'connection'],
        ['DataObjectReference', 'data-object'],
        ['DataStoreReference', 'data-store']
    ]);

    // Event definitions whose bpmn-font name is not the lower-cased definition name
    static #EVENT_ICON_NAMES = new Map([
        ['Conditional', 'condition'],
        ['Compensate', 'compensation']
    ]);

    #changedTextElement;
    #addedRemovedLabelElement;
    #addedRemovedTextElement;
    #table;
    #elementRegistry = null;
    #highlighter = null;
    #canvas = null;
    #selection = null;
    #diff = null;
    // [element, DiffType] of every change in the diagram, whichever plane it is on
    #elems = [];
    #selectedRow = null;
    #selectedElem = null;

    constructor(changedTextElement, addedRemovedLabelElement, addedRemovedTextElement, table) {
        this.#changedTextElement = changedTextElement;
        this.#addedRemovedLabelElement = addedRemovedLabelElement;
        this.#addedRemovedTextElement = addedRemovedTextElement;
        this.#table = table;
    }

    init(elementRegistry, highlighter, canvas, selection, eventBus) {
        this.#elementRegistry = elementRegistry;
        this.#highlighter = highlighter;
        this.#canvas = canvas;
        this.#selection = selection;
        // The list follows the plane on screen: drilling into a collapsed subprocess
        // or back out of it
        eventBus.on('root.set', () => this.#render());
    }

    fill(diff, diffTypeForMissing) {
        const changedElems = this.#getElemsForTable(
            [...diff.changedShapeIds, ...diff.changedRowIds], DiffType.CHANGE);
        const missingElems = this.#getElemsForTable(
            [...diff.missingShapeIds, ...diff.missingRowIds], diffTypeForMissing);

        if (diffTypeForMissing === DiffType.ADD) {
            this.#addedRemovedLabelElement.textContent = 'Added:';
        } else {
            this.#addedRemovedLabelElement.textContent = 'Removed:';
        }
        // The counters cover the whole diagram, the list only the plane on screen
        this.#changedTextElement.textContent = String(changedElems.length);
        this.#addedRemovedTextElement.textContent = String(missingElems.length);

        this.#diff = diff;
        this.#elems = [...changedElems, ...missingElems];
        this.#render();
    }

    // Lists the changes on the shown plane; the changes inside a collapsed subprocess
    // on it, however deep, make one row of that subprocess
    #render() {
        this.resetSelection();
        this.#selectedRow = null;
        this.#selectedElem = null;
        this.#table.innerHTML = '';

        const shownRoot = this.#canvas.getRootElement();
        const entries = new Map();
        const entryOf = (elem) => {
            if (!entries.has(elem.id)) {
                entries.set(elem.id, { elem, diffType: null, inside: 0 });
            }
            return entries.get(elem.id);
        };
        for (const [elem, diffType] of this.#elems) {
            const place = this.#placeOnPlane(elem, shownRoot);
            if (!place) {
                continue;
            }
            if (place.holder) {
                entryOf(place.holder).inside++;
            } else {
                entryOf(elem).diffType = diffType;
            }
        }
        if (entries.size === 0) {
            return;
        }

        this.#addHeader();
        const tbody = document.createElement('tbody');
        this.#table.appendChild(tbody);

        for (const entry of this.#sortEntries(this.#diff.processNode, [...entries.values()])) {
            this.#addRow(tbody, entry);
        }
    }

    // Where elem shows on the given plane: { holder: null } when it lies on it,
    // { holder: <collapsed subprocess on it> } when it lies on a plane under that
    // subprocess, null when it is not under the plane at all
    #placeOnPlane(elem, planeRoot) {
        let plane = this.#canvas.findRoot(elem);
        let holder = null;
        while (plane && plane !== planeRoot) {
            // A collapsed subprocess's plane shares its business object with the
            // subprocess shape on the plane above; the top plane's resolves to itself
            holder = this.#elementRegistry.get(plane.businessObject.id);
            if (!holder || holder === plane) {
                return null;
            }
            plane = this.#canvas.findRoot(holder);
        }
        return plane ? { holder } : null;
    }

    // Empties the table and counters — used when the shown side has no diagram
    // to compare (switched to an absent version, UX-0003).
    clear() {
        this.resetSelection();
        this.#selectedRow = null;
        this.#selectedElem = null;
        this.#diff = null;
        this.#elems = [];
        this.#changedTextElement.textContent = '';
        this.#addedRemovedLabelElement.textContent = '';
        this.#addedRemovedTextElement.textContent = '';
        this.#table.innerHTML = '';
    }

    resetSelection() {
        if (this.#selectedRow) {
            this.#selectedRow.classList.remove('selected');
        }
        if (this.#selectedElem) {
            this.#highlighter.removeMarker(this.#selectedElem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
        }
    }

    // The changed property groups of an element, as the properties panel names them
    static whatChanged(elemId, nodeIdToDiffsMap, typeChangedIds) {
        const items = new Set(nodeIdToDiffsMap.get(elemId) ?? []);
        return [...(typeChangedIds.includes(elemId) ? ['Type'] : []), ...items].join(', ');
    }

    // bpmn-font class of the icon for a bpmn-js element; an unknown type yields a
    // class with no glyph, which leaves the title (the type) to name it
    static iconClass(elem) {
        const bo = elem.businessObject;
        const type = bo.$type.replace(/^bpmn:/, '');
        let name;
        if (type.endsWith('Event')) {
            name = ChangesTableView.#eventIconName(bo, type);
        } else if (type === 'SubProcess') {
            const kind = bo.triggeredByEvent ? 'event-subprocess' : 'subprocess';
            name = `${kind}-${elem.collapsed ? 'collapsed' : 'expanded'}`;
        } else if (type === 'SequenceFlow' && bo.sourceRef?.default === bo) {
            name = 'default-flow';
        } else if (type === 'SequenceFlow' && bo.conditionExpression) {
            name = 'conditional-flow';
        } else {
            name = ChangesTableView.#TYPE_ICON_NAMES.get(type)
                ?? type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
        }
        return `bpmn-icon-${name}`;
    }

    static #eventIconName(bo, type) {
        const definitions = bo.eventDefinitions ?? [];
        let kind = 'none';
        if (definitions.length > 1) {
            kind = 'multiple';
        } else if (definitions.length === 1) {
            const definition = definitions[0].$type.replace(/^bpmn:|EventDefinition$/g, '');
            kind = ChangesTableView.#EVENT_ICON_NAMES.get(definition) ?? definition.toLowerCase();
        }
        switch (type) {
            case 'StartEvent':
                return `start-event-${bo.isInterrupting === false ? 'non-interrupting-' : ''}${kind}`;
            case 'EndEvent':
                return `end-event-${kind}`;
            case 'IntermediateThrowEvent':
                return kind === 'none' ? 'intermediate-event-none' : `intermediate-event-throw-${kind}`;
            default:
                // IntermediateCatchEvent, BoundaryEvent
                return `intermediate-event-catch-${bo.cancelActivity === false ? 'non-interrupting-' : ''}${kind}`;
        }
    }

    // Document order of the element ids: the order in which elements were added to the
    // schema, not the sequence of elements passing through it. Ids outside the
    // document go last.
    #sortEntries(rootBpmnNode, entries) {
        const idToIndexMap = new Map();
        Array.from(rootBpmnNode.ownerDocument.querySelectorAll('[id]'))
            .forEach((node, index) => idToIndexMap.set(node.getAttribute('id'), index));

        const indexOf = (entry) => idToIndexMap.get(entry.elem.id) ?? Number.MAX_SAFE_INTEGER;
        return entries.sort((entryA, entryB) => indexOf(entryA) - indexOf(entryB));
    }

    #getElemsForTable(elemIds, diffType) {
        return elemIds
            .map(id => this.#elementRegistry.get(id))
            .filter(elem => elem && elem.type !== 'bpmn:Association')
            .map(elem => [elem, diffType]);
    }

    #addHeader() {
        const thead = document.createElement('thead');
        this.#table.appendChild(thead);
        const row = document.createElement('tr');
        thead.appendChild(row);

        for (const [text, className] of [
            ['', 'changes-table-icons'], ['Element', 'changes-table-element'], ['What changed', '']
        ]) {
            const cell = document.createElement('th');
            cell.className = className;
            cell.textContent = text;
            row.appendChild(cell);
        }
    }

    #addRow(tbody, { elem, diffType, inside }) {
        const bo = elem.businessObject;
        const type = bo.$type.replace(/^bpmn:/, '');

        const row = document.createElement('tr');
        row.dataset.elementId = elem.id;
        tbody.appendChild(row);

        const cellIcons = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'changes-table-badge';
        if (diffType) {
            badge.style.backgroundColor = diffType.shapeColor;
            badge.title = diffType.name;
            badge.textContent = ChangesTableView.#CHANGE_GLYPHS.get(diffType.name);
        } else {
            // Unchanged itself: outlined, as the canvas strokes such a subprocess
            badge.style.boxShadow = `inset 0 0 0 2px ${DiffType.CHANGE.rowColor}`;
            badge.title = 'changed inside';
            badge.textContent = ChangesTableView.#CHANGE_GLYPHS.get(DiffType.CHANGE.name);
        }
        const typeIcon = document.createElement('span');
        typeIcon.className = `changes-table-type ${ChangesTableView.iconClass(elem)}`;
        typeIcon.title = type;
        cellIcons.append(badge, typeIcon);
        row.appendChild(cellIcons);

        const cellElement = document.createElement('td');
        const label = ChangesTableView.#label(elem);
        cellElement.appendChild(document.createTextNode(label || elem.id));
        if (label && label !== elem.id) {
            const idSpan = document.createElement('span');
            idSpan.className = 'changes-table-id';
            idSpan.textContent = elem.id;
            cellElement.appendChild(idSpan);
        }
        row.appendChild(cellElement);

        const own = diffType === DiffType.CHANGE
            ? ChangesTableView.whatChanged(elem.id, this.#diff.nodeIdToDiffsMap, this.#diff.typeChangedIds)
            : '';
        const cellChanged = document.createElement('td');
        cellChanged.textContent = [own, ChangesTableView.insideText(inside)].filter(Boolean).join(' · ');
        row.appendChild(cellChanged);

        row.addEventListener('click', () => this.#onRowSelected(row, elem.id));
    }

    static insideText(count) {
        if (count === 0) {
            return '';
        }
        return `${count} ${count === 1 ? 'change' : 'changes'} inside`;
    }


    // A connection is told apart by its ends: "name (Source → Target)"
    static #label(elem) {
        const name = elem.businessObject.name ?? '';
        if (!elem.source || !elem.target) {
            return name;
        }
        const end = (shape) => shape.businessObject.name || shape.id;
        const ends = `${end(elem.source)} → ${end(elem.target)}`;
        return name ? `${name} (${ends})` : ends;
    }

    #onRowSelected(row, elemId) {
        this.resetSelection();

        this.#selectedRow = row;
        this.#selectedRow.classList.add('selected');

        this.#selectedElem = this.#elementRegistry.get(elemId);
        if (!this.#selectedElem) {
            console.warn('onRowSelected: bpmn elem not found by id: ' + elemId);
            return;
        }
        this.#highlighter.addMarker(this.#selectedElem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
        try {
            this.#canvas.scrollToElement(this.#selectedElem);
            this.#selection.select(this.#selectedElem);
        } catch (error) {
            // The root element (a process-level change) can be neither scrolled to nor selected
        }
    }
}

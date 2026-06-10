// Table of changed/added/removed elements in the footer of the differ page
class ChangesTableView {
    #changedTextElement;
    #addedRemovedLabelElement;
    #addedRemovedTextElement;
    #table;
    #elementRegistry = null;
    #highlighter = null;
    #selectedRow = null;
    #selectedElem = null;

    constructor(changedTextElement, addedRemovedLabelElement, addedRemovedTextElement, table) {
        this.#changedTextElement = changedTextElement;
        this.#addedRemovedLabelElement = addedRemovedLabelElement;
        this.#addedRemovedTextElement = addedRemovedTextElement;
        this.#table = table;
    }

    init(elementRegistry, highlighter) {
        this.#elementRegistry = elementRegistry;
        this.#highlighter = highlighter;
    }

    fill(rootBpmnNode, diffTypeForMissing, missingShapeIds, missingRowIds, changedShapeIds, changedRowIds) {
        // do not add rows to the change table yet
        const changedElems = this.#getElemsForTable(changedShapeIds, DiffType.CHANGE);
        const missingElems = this.#getElemsForTable(missingShapeIds, diffTypeForMissing);

        if (diffTypeForMissing === DiffType.ADD) {
            this.#addedRemovedLabelElement.textContent = 'Added:';
        } else {
            this.#addedRemovedLabelElement.textContent = 'Removed:';
        }
        this.#changedTextElement.textContent = `${changedElems.length} elements (${changedRowIds.length} rows)`;
        this.#addedRemovedTextElement.textContent = `${missingElems.length} elements (${missingRowIds.length} rows)`;

        // Remove all old rows from the table
        this.#table.innerHTML = "";

        const allElems = [...changedElems, ...missingElems];
        if (allElems.length === 0) {
            return;
        }

        this.#addHeader();
        const tbody = document.createElement('tbody');
        this.#table.appendChild(tbody);

        const sortedElems = this.#sortChangedElems(rootBpmnNode, allElems);

        for (const [elem, diffType] of sortedElems) {
            this.#addRow(tbody, diffType, elem);
        }
    }

    resetSelection() {
        if (this.#selectedRow) {
            this.#selectedRow.style.backgroundColor = '#ffffff';
        }
        if (this.#selectedElem) {
            this.#highlighter.removeMarker(this.#selectedElem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
        }
    }

    // This sorting reflects the order in which elements are added to the bpmn schema,
    // not the sequence of elements passing through it
    #sortChangedElems(rootBpmnNode, elemToDiffTypeArray) {
        const idToIndexMap = new Map();
        Array.from(rootBpmnNode.querySelectorAll('[id]'))
            .map(elem => elem.getAttribute('id'))
            .filter(id => id)
            .forEach((id, index) => {
                idToIndexMap.set(id, index);
            });

        elemToDiffTypeArray.sort(([elemA, dtA], [elemB, dtB]) => {
            const indexA = idToIndexMap.get(elemA.id);
            const indexB = idToIndexMap.get(elemB.id);
            return indexA - indexB;
        });

        return elemToDiffTypeArray;
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

        const cellChange = document.createElement('th');
        cellChange.style.minWidth = '60px';
        cellChange.appendChild(document.createTextNode('Change'));
        row.appendChild(cellChange);

        const cellId = document.createElement('th');
        cellId.style.minWidth = '60px';
        cellId.appendChild(document.createTextNode('Id'));
        row.appendChild(cellId);

        const cellName = document.createElement('th');
        cellName.style.minWidth = '200px';
        cellName.appendChild(document.createTextNode('Name'));
        row.appendChild(cellName);

        const cellType = document.createElement('th');
        cellType.style.minWidth = '200px';
        cellType.appendChild(document.createTextNode('Type'));
        row.appendChild(cellType);

        const cellProps = document.createElement('th');
        cellProps.style.width = '100%';
        cellProps.appendChild(document.createTextNode('Propepties'));
        row.appendChild(cellProps);
    }

    #addRow(tbody, diffType, elem) {
        const elemId = elem.id;
        let name = '';
        let type = '';
        let propsHtml = '';
        if (elem && elem.di && elem.di.bpmnElement) {
            const bpmnElement = elem.di.bpmnElement;

            name = bpmnElement.name;
            type = bpmnElement.$type;
            if (type.startsWith('bpmn:')) {
                type = type.slice(5);
            }

            switch (type) {
                case 'ServiceTask':
                    if (bpmnElement.delegateExpression) {
                        propsHtml = `delegate = ${bpmnElement.delegateExpression}`;
                    } else if (bpmnElement.topic) {
                        propsHtml = `topic = ${bpmnElement.topic}`;
                    } else if (bpmnElement.expression) {
                        propsHtml = `expression = ${bpmnElement.expression}`;
                    }
                    propsHtml += '<br>';

                case 'CallActivity':
                    propsHtml += `
                        asyncBefore = ${bpmnElement.asyncBefore}<br>
                        asyncAfter = ${bpmnElement.asyncAfter}<br>
                        exclusive = ${bpmnElement.exclusive}`;
                    break;

                default:
            }
            // console.debug('bpmnElement', bpmnElement);
        }

        const row = document.createElement('tr');
        tbody.appendChild(row);

        const cellChange = document.createElement('td');
        cellChange.style.backgroundColor = diffType.shapeColor;
        cellChange.appendChild(document.createTextNode(diffType.name));
        row.appendChild(cellChange);

        const cellId = document.createElement('td');
        cellId.appendChild(document.createTextNode(elemId));
        row.appendChild(cellId);

        const cellName = document.createElement('td');
        cellName.appendChild(document.createTextNode(name));
        row.appendChild(cellName);

        const cellType = document.createElement('td');
        cellType.appendChild(document.createTextNode(type));
        row.appendChild(cellType);

        const cellProps = document.createElement('td');
        cellProps.innerHTML = propsHtml;
        row.appendChild(cellProps);

        row.addEventListener('click', (event) => this.#onRowSelected(row, elemId));
    }

    #onRowSelected(row, elemId) {
        this.resetSelection();

        this.#selectedRow = row;
        this.#selectedRow.style.backgroundColor = '#ffffdd';

        this.#selectedElem = this.#elementRegistry.get(elemId);
        if (this.#selectedElem) {
            this.#highlighter.addMarker(this.#selectedElem, DiffHighlighter.BIG_HIGHLIGHTING_MARKER);
        } else {
            console.warn('onRowSelected: bpmn elem not found by id: ' + elemId);
        }
    }
}

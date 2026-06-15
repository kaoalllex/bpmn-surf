// Full-text search over BPMN elements (FEAT-0006): builds a searchable text
// index from the bpmn-js elementRegistry and finds element ids matching a query
// by name, id, or any parameter value (condition expression and its variables,
// In/Out mappings, Inputs/Outputs, delegate/class/topic/expression, calledElement,
// documentation, ...). Unlike the viewer's built-in search (name/id only), this
// reaches into the moddle business object of every element.
class ElementSearcher {
    // [{ id, text }] — text is lowercased; element document order is preserved.
    #index = [];

    // Rebuilds the index from the currently imported diagram. Call after each
    // importXML (the registry is recreated on every version switch).
    buildIndex(elementRegistry) {
        this.#index = [];
        for (const elem of elementRegistry.getAll()) {
            if (!elem || !elem.id || elem.id.endsWith('_label')) {
                continue;
            }
            const bo = elem.businessObject;
            if (!bo) {
                continue;
            }
            const text = ElementSearcher.buildSearchText(bo);
            if (text) {
                this.#index.push({ id: elem.id, text });
            }
        }
    }

    // Returns the ids of elements whose searchable text contains the query
    // (case-insensitive substring). Empty/blank query yields no matches.
    search(query) {
        const normalized = (query || '').trim().toLowerCase();
        if (!normalized) {
            return [];
        }
        return this.#index
            .filter(entry => entry.text.includes(normalized))
            .map(entry => entry.id);
    }

    // Collects every primitive value reachable from an element's business object
    // into one lowercased string. Recurses into anonymous nested config objects
    // (extensionElements, conditionExpression, In/Out mappings, inputOutput,
    // documentation, ...) but NOT into references to other diagram elements
    // (sourceRef/targetRef/incoming/outgoing/flowElements/lanes), which are
    // skipped because they carry their own id — otherwise a container element
    // would absorb the text of the whole diagram.
    static buildSearchText(businessObject) {
        const parts = [];
        ElementSearcher.#collect(businessObject, parts, new Set(), 0, true);
        return parts.join(' ').toLowerCase();
    }

    static #collect(value, parts, seen, depth, isRoot) {
        if (value === null || value === undefined || depth > 8) {
            return;
        }
        const type = typeof value;
        if (type === 'string') {
            parts.push(value);
            return;
        }
        if (type === 'number' || type === 'boolean') {
            parts.push(String(value));
            return;
        }
        if (type !== 'object' || seen.has(value)) {
            return;
        }
        seen.add(value);

        if (Array.isArray(value)) {
            for (const item of value) {
                ElementSearcher.#collect(item, parts, seen, depth + 1, false);
            }
            return;
        }

        // A nested moddle object with its own id is a reference to another
        // diagram element — index it separately, not as part of this one.
        if (!isRoot && value.id !== null && value.id !== undefined) {
            return;
        }

        // Non-modeled attributes (e.g. unknown camunda extension attrs).
        if (value.$attrs) {
            for (const key of Object.keys(value.$attrs)) {
                ElementSearcher.#collect(value.$attrs[key], parts, seen, depth + 1, false);
            }
        }
        for (const key of Object.keys(value)) {
            // Skip $-prefixed moddle internals ($type/$parent/$descriptor and
            // $attrs, already handled above) and the di (rendering) reference.
            if (key.startsWith('$') || key === 'di') {
                continue;
            }
            ElementSearcher.#collect(value[key], parts, seen, depth + 1, false);
        }
    }
}

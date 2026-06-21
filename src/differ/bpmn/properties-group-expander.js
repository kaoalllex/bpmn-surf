// FEAT-0029: auto-expands the property-panel groups most relevant to the selected
// element so its meaningful properties are visible immediately, instead of the user
// hunting for and manually opening the collapsed group.
//
// Two axes, expanded as a deduped union (only expand, never collapse):
//  - Axis A — changed groups: every group the diff recorded for the element
//    (BpmnXmlComparator#nodeIdToDiffsMap), expanded as-is even when its list is
//    empty on the shown side ("it changed, show the user").
//  - Axis B — groups characteristic of the element type, derived purely from the
//    element / its business object (relevantGroupsForElement). The list groups
//    (In/Out mappings, Inputs/Outputs) are gated to non-empty here; axis A is not.
//
// Sibling of PropertiesPanelHighlighter: same header-text lookup
// (findPropertiesGroupHeader), same doWithAttempts retry to ride out the panel's
// async preact re-render (BUG-0011). BPMN only — the DMN differ has no properties
// panel.
class PropertiesGroupExpander {
    // Tasks whose defining group in the panel is "Implementation".
    static #IMPLEMENTATION_TASK_TYPES = new Set([
        'bpmn:ServiceTask', 'bpmn:SendTask', 'bpmn:ScriptTask', 'bpmn:BusinessRuleTask'
    ]);

    // Event-definition $type -> the panel group it characterizes. Keyed on the
    // nested *EventDefinition (bo.eventDefinitions), NOT on element.type, so the
    // rule is uniform across start / intermediate catch+throw / boundary / end
    // events (e.g. a message boundary event yields "Message", a timer boundary
    // "Timer"). Precedent: CorrelationLocator reads the nested
    // MessageEventDefinition the same way.
    static #EVENT_DEFINITION_GROUP = new Map([
        ['bpmn:ConditionalEventDefinition', 'Condition'],
        ['bpmn:MessageEventDefinition', 'Message'],
        ['bpmn:TimerEventDefinition', 'Timer'],
        ['bpmn:ErrorEventDefinition', 'Error'],
        ['bpmn:EscalationEventDefinition', 'Escalation']
    ]);

    #elementRegistry = null;
    #nodeIdToDiffsMap = new Map();
    // Elements already auto-expanded once. Switching branch re-imports the diagram
    // and re-selects the same element, which would re-run the expansion and re-open
    // a group the user has meanwhile collapsed. The panel itself preserves the
    // open/collapsed state across the re-import (its preact layout state survives
    // the re-render), so after the first expand we simply stop fighting the user's
    // manual choice for that element. Persists for the lifetime of the differ page.
    #expandedElementIds = new Set();

    init(elementRegistry) {
        this.#elementRegistry = elementRegistry;
    }

    setDiffData(nodeIdToDiffsMap) {
        this.#nodeIdToDiffsMap = nodeIdToDiffsMap;
    }

    // Axis B: groups characteristic of the element type, derived purely from the
    // element and its business object. No DOM access — unit-testable with fakes.
    static relevantGroupsForElement(element) {
        if (!element) {
            return [];
        }
        const groups = new Set();
        const bo = element.businessObject;

        // Condition on a sequence flow leaving a gateway.
        if (element.type === 'bpmn:SequenceFlow'
            && element.source && typeof element.source.type === 'string'
            && element.source.type.endsWith('Gateway')) {
            groups.add('Condition');
        }

        // Event groups, keyed on the nested event definitions (uniform across all
        // event-bearing elements, boundary events included).
        const eventDefinitions = PropertiesGroupExpander.#read(bo, 'eventDefinitions');
        if (Array.isArray(eventDefinitions)) {
            for (const definition of eventDefinitions) {
                const group = definition
                    && PropertiesGroupExpander.#EVENT_DEFINITION_GROUP.get(definition.$type);
                if (group) {
                    groups.add(group);
                }
            }
        }

        // A ReceiveTask waits for a message but carries no event definition.
        if (element.type === 'bpmn:ReceiveTask') {
            groups.add('Message');
        }

        // Tasks that carry an implementation.
        if (PropertiesGroupExpander.#IMPLEMENTATION_TASK_TYPES.has(element.type)) {
            groups.add('Implementation');
        }

        // A UserTask carries the form configuration.
        if (element.type === 'bpmn:UserTask') {
            groups.add('Forms');
        }

        // Multi-instance, on any element carrying its loop characteristics.
        const loop = PropertiesGroupExpander.#read(bo, 'loopCharacteristics');
        if (loop && loop.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
            groups.add('Multi-instance');
        }

        // List groups — only when non-empty, decided from the business object.
        // ("Called element" is deliberately omitted for a CallActivity: diving in
        // is one click away via the dive-in overlay; its useful content is the
        // In/Out mappings handled here.)
        PropertiesGroupExpander.#addNonEmptyListGroups(bo, groups);

        return Array.from(groups);
    }

    static #addNonEmptyListGroups(bo, groups) {
        const extensionElements = PropertiesGroupExpander.#read(bo, 'extensionElements');
        const values = extensionElements
            && PropertiesGroupExpander.#read(extensionElements, 'values');
        if (!Array.isArray(values)) {
            return;
        }
        for (const value of values) {
            if (!value) {
                continue;
            }
            if (value.$type === 'camunda:In') {
                groups.add('In mappings');
            } else if (value.$type === 'camunda:Out') {
                groups.add('Out mappings');
            } else if (value.$type === 'camunda:InputOutput') {
                const inputs = PropertiesGroupExpander.#read(value, 'inputParameters');
                const outputs = PropertiesGroupExpander.#read(value, 'outputParameters');
                if (Array.isArray(inputs) && inputs.length > 0) {
                    groups.add('Inputs');
                }
                if (Array.isArray(outputs) && outputs.length > 0) {
                    groups.add('Outputs');
                }
            }
        }
    }

    // Reads a moddle property either as a plain field or via get() (the precedent
    // pattern from CorrelationLocator), so the same code works on real moddle
    // objects and on plain test fakes.
    static #read(object, property) {
        if (!object) {
            return null;
        }
        if (object[property] !== undefined) {
            return object[property];
        }
        return object.get ? object.get(property) : null;
    }

    // Expands (never collapses) the union of axis-A and axis-B groups for the
    // selected element. A group absent in the panel DOM is a silent no-op (axis B
    // routinely names groups the element does not render) — unlike the highlighter,
    // which warns, here a missing group is normal.
    async expandRelevantGroups(elementId) {
        // Auto-expand each element only once, so a re-selection (e.g. the
        // synthetic one on Switch branch) keeps the user's manual collapses.
        if (this.#expandedElementIds.has(elementId)) {
            return;
        }
        this.#expandedElementIds.add(elementId);

        const element = this.#elementRegistry && this.#elementRegistry.get(elementId);
        const axisB = PropertiesGroupExpander.relevantGroupsForElement(element);
        const axisA = this.#nodeIdToDiffsMap.get(elementId) || [];
        const groupNames = new Set([...axisA, ...axisB]);

        for (const groupName of groupNames) {
            const groupHeader = await findPropertiesGroupHeader(groupName);
            if (!groupHeader) {
                continue;
            }
            this.#expandGroup(groupHeader);
        }
    }

    // Opens the group via a header click ONLY when it is currently collapsed —
    // detect-before-click is critical, otherwise a group already open by default
    // would get toggled shut. The panel marks an open group by adding the `open`
    // class to the header element itself (groupHeader) — uniformly for plain
    // groups and list groups (whose entries containers differ:
    // `.bio-properties-panel-group-entries` vs `.bio-properties-panel-list`), so
    // the header class is the one reliable signal across both.
    #expandGroup(groupHeader) {
        if (groupHeader.classList.contains('open')) {
            return;
        }
        groupHeader.click();
    }
}

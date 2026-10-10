// Semantic comparison of two BPMN XML documents.
// Produces a diff result object without touching the page DOM or bpmn-js.
class BpmnXmlComparator {
    static #PROCESS_TAG_NAME = 'bpmn:process';
    static #SUBPROCESS_TAG_NAME = 'bpmn:subProcess';
    static #MESSAGE_TAG_NAME = 'bpmn:message';
    static #ESCALATION_TAG_NAME = 'bpmn:escalation';
    static #ERROR_TAG_NAME = 'bpmn:error';
    // Children that describe the subprocess itself, not the flow inside it
    static #SUBPROCESS_OWN_CHILD_TAG_NAMES = [
        'bpmn:multiInstanceLoopCharacteristics',
        'bpmn:extensionElements'
    ];

    static #ROW_TAG_NAMES = [
        'bpmn:sequenceFlow',
        'bpmn:messageFlow',
        'bpmn:association'
    ];

    static #CONNECTOR_TAG_NAMES = [
        'bpmn:incoming',
        'bpmn:outgoing'
    ];

    // Tags whose text is an expression: whitespace outside string literals is insignificant
    static #EXPRESSION_TAG_NAMES = [
        'bpmn:conditionExpression'
    ];

    static #WORD_CHAR = /[\p{L}\p{N}_$]/u;
    static #WHITESPACE_CHAR = /\s/;

    // An absent attribute means its schema default, so stating the default is no change
    static #ATTRIBUTE_DEFAULTS = new Map([
        ['isInterrupting', 'true'],
        ['cancelActivity', 'true'],
        // camunda-bpmn-moddle AsyncCapable
        ['camunda:asyncBefore', 'false'],
        ['camunda:asyncAfter', 'false'],
        ['camunda:exclusive', 'true'],
        // zeebe-bpmn-moddle (bare attributes on zeebe: elements); retries has no
        // moddle default, but 3 is the engine's and Camunda Modeler always writes it
        ['propagateAllParentVariables', 'true'],
        ['bindingType', 'latest'],
        ['retries', '3']
    ]);

    // Extension containers whose entries are diffed one by one
    static #CONTAINER_TAG_NAMES = [
        'bpmn:extensionElements',
        'camunda:inputOutput',
        'zeebe:ioMapping',
        'zeebe:taskHeaders',
        'zeebe:properties',
        'zeebe:executionListeners',
        'zeebe:taskListeners'
    ];

    static #IGNORED_DIFF_PROPERTY_GROUP = '_ignored_';
    // No property group to highlight, but the panel's header text does change
    // (e.g. "Timer boundary event" -> "Timer boundary event (non interrupting)"),
    // so the header itself gets the 'changed' colour, the same way a type change does.
    static #HEADER_DIFF_PROPERTY_GROUP = '_header_';


    /**
     * List-based property groups whose changed entries are highlighted
     * individually in the panel (not only as a whole group). For each group:
     * how to extract its entries from a node and which attribute is the entry's
     * panel label (the value shown in the list item header).
     *   tag       — entry element tag
     *   keyAttr   — attribute used as the list item label / match key
     *   parentTag — wrapping element inside extensionElements (Inputs/Outputs)
     *   skip      — entries handled by other panel groups (not in this list)
     */
    static #LIST_GROUP_CONFIG = new Map([
        ['In mappings', {
            tag: 'camunda:in', keyAttr: 'target',
            skip: (e) => e.hasAttribute('businessKey') || e.getAttribute('variables') === 'all'
        }],
        ['Out mappings', {
            tag: 'camunda:out', keyAttr: 'target',
            skip: (e) => e.getAttribute('variables') === 'all'
        }],
        ['Inputs', {
            tag: 'camunda:inputParameter', keyAttr: 'name', parentTag: 'camunda:inputOutput'
        }],
        ['Outputs', {
            tag: 'camunda:outputParameter', keyAttr: 'name', parentTag: 'camunda:inputOutput'
        }],
        ['Extension properties', {
            tag: ['camunda:property', 'zeebe:property'], keyAttr: 'name',
            parentTag: ['camunda:properties', 'zeebe:properties']
        }],
        ['Input mapping', {
            tag: 'zeebe:input', keyAttr: 'target', parentTag: 'zeebe:ioMapping'
        }],
        ['Output mapping', {
            tag: 'zeebe:output', keyAttr: 'target', parentTag: 'zeebe:ioMapping'
        }],
        ['Headers', {
            tag: 'zeebe:header', keyAttr: 'key', parentTag: 'zeebe:taskHeaders'
        }]
    ]);

    /**
     * key: diff name mask
     * value: property group name
     */
    static #DIFF_TO_PROPERTY_GROUP_MAP = new Map([
        ['name', 'General'],

        // the textAnnotation's child elem
        ['bpmn:text', 'General'],

        ['camunda:exclusive', 'Asynchronous continuations'],
        ['camunda:asyncBefore', 'Asynchronous continuations'],
        ['camunda:asyncAfter', 'Asynchronous continuations'],

        // the whole element added/removed (the multi-instance marker toggled)
        ['bpmn:multiInstanceLoopCharacteristics', 'Multi-instance'],
        ['camunda:collection', 'Multi-instance'],
        ['camunda:elementVariable', 'Multi-instance'],
        ['bpmn:loopCardinality', 'Multi-instance'],
        ['bpmn:completionCondition', 'Multi-instance'],
        ['bpmn:multiInstanceLoopCharacteristics/camunda:failedJobRetryTimeCycle', 'Multi-instance'],
        // the multi-instance body's own async flags, not the activity's
        ['bpmn:multiInstanceLoopCharacteristics/camunda:asyncBefore', 'Multi-instance'],
        ['bpmn:multiInstanceLoopCharacteristics/camunda:asyncAfter', 'Multi-instance'],
        ['bpmn:multiInstanceLoopCharacteristics/camunda:exclusive', 'Multi-instance'],

        ['camunda:delegateExpression', 'Implementation'],
        ['camunda:expression', 'Implementation'],
        ['camunda:type', 'Implementation'],
        ['camunda:topic', 'Implementation'],

        ['bpmn:conditionExpression', 'Condition'],
        ['camunda:variableName', 'Condition'],
        ['bpmn:condition', 'Condition'],
        ['bpmn:conditionalEventDefinition', 'Condition'],

        ['camunda:in', 'In mappings'],
        ['camunda:in/source', 'In mappings'],
        ['camunda:in/target', 'In mappings'],
        ['camunda:in/sourceExpression', 'In mappings'],

        ['camunda:in/variables', 'In mapping propagation'],

        ['camunda:out', 'Out mappings'],
        ['camunda:out/variables', 'Out mapping propagation'],
        ['camunda:out/source', 'Out mappings'],
        ['camunda:out/target', 'Out mappings'],
        ['camunda:out/sourceExpression', 'Out mappings'],

        ['camunda:inputParameter', 'Inputs'],
        ['camunda:outputParameter', 'Outputs'],

        ['bpmn:escalationEventDefinition', 'Escalation'],
        ['bpmn:escalationEventDefinition/camunda:escalationCodeVariable', 'Escalation'],
        ['escalationRef', 'Escalation'],

        ['bpmn:error', 'Error'],
        ['bpmn:errorEventDefinition', 'Error'],
        ['errorRef', 'Error'],
        ['bpmn:errorEventDefinition/camunda:errorCodeVariable', 'Error'],
        ['bpmn:errorEventDefinition/camunda:errorMessageVariable', 'Error'],
        // an external task's error definitions, listed in their own panel group
        ['camunda:errorEventDefinition', 'Errors'],
        ['camunda:errorEventDefinition/errorRef', 'Errors'],
        ['camunda:errorEventDefinition/expression', 'Errors'],

        ['camunda:executionListener', 'Execution listeners'],
        ['camunda:executionListener/delegateExpression', 'Execution listeners'],

        ['bpmn:timerEventDefinition', 'Timer'],
        ['bpmn:timeDuration', 'Timer'],
        ['bpmn:timeCycle', 'Timer'],
        ['bpmn:timeDate', 'Timer'],

        ['calledElement', 'Called element'],
        ['businessKey', 'Called element'],
        ['bpmn:callActivity/camunda:calledElementBinding', 'Called element'],

        ['camunda:assignee', 'User assignment'],
        ['camunda:candidateGroups', 'User assignment'],
        ['camunda:candidateUsers', 'User assignment'],
        ['camunda:dueDate', 'User assignment'],
        ['camunda:followUpDate', 'User assignment'],
        ['camunda:priority', 'User assignment'],

        ['camunda:jobPriority', 'Job execution'],
        ['camunda:failedJobRetryTimeCycle', 'Job execution'],

        ['camunda:properties', 'Extension properties'],
        ['camunda:property', 'Extension properties'],
        ['camunda:property/name', 'Extension properties'],
        ['camunda:property/value', 'Extension properties'],

        ['camunda:formField', 'Form fields'],
        ['camunda:formField/label', 'Form fields'],

        ['messageRef', 'Message'],
        ['bpmn:messageEventDefinition', 'Message'],

        ['bpmn:documentation', 'Documentation'],

        // Camunda 8 (zeebe-bpmn-moddle). A zeebe: element keeps its attributes
        // unprefixed, so they fall back to the element's own row
        // (see #findDiffPropertyGroup) unless a row names the attribute.
        ['zeebe:taskDefinition', 'Task definition'],
        ['zeebe:jobPriorityDefinition', 'Job priority'],
        ['zeebe:ioMapping', 'Input mapping'],
        ['zeebe:input', 'Input mapping'],
        ['zeebe:output', 'Output mapping'],
        ['zeebe:taskHeaders', 'Headers'],
        ['zeebe:header', 'Headers'],
        ['zeebe:properties', 'Extension properties'],
        ['zeebe:property', 'Extension properties'],
        ['zeebe:calledElement', 'Called element'],
        ['zeebe:calledElement/propagateAllParentVariables', 'Input propagation'],
        ['zeebe:calledElement/propagateAllChildVariables', 'Output propagation'],
        ['zeebe:calledDecision', 'Called decision'],
        ['zeebe:script', 'Script'],
        ['zeebe:loopCharacteristics', 'Multi-instance'],
        ['zeebe:userTask', 'Implementation'],
        ['zeebe:assignmentDefinition', 'Assignment'],
        ['zeebe:taskSchedule', 'Assignment'],
        ['zeebe:priorityDefinition', 'Assignment'],
        ['zeebe:formDefinition', 'Form'],
        ['zeebe:userTaskForm', 'Form'],
        ['zeebe:executionListeners', 'Execution listeners'],
        ['zeebe:executionListener', 'Execution listeners'],
        ['zeebe:taskListeners', 'Task listeners'],
        ['zeebe:taskListener', 'Task listeners'],

        // Properties to be ignored because there is no property group to highlight
        ['bpmn:terminateEventDefinition', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:multiInstanceLoopCharacteristics/isSequential', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:standardLoopCharacteristics', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:boundaryEvent/attachedToRef', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:outputSet', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:inputSet', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],

        // No dedicated field in the panel, but it does change the header text
        ['bpmn:boundaryEvent/cancelActivity', BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP],
        ['bpmn:startEvent/isInterrupting', BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP],
        // element template attributes: the template module is not loaded, so no group
        ['zeebe:modelerTemplate', BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP],
        ['zeebe:modelerTemplateVersion', BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP],
        ['zeebe:modelerTemplateIcon', BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP]
    ]);

    #changedMessages = [];
    #changedEscalations = [];
    #changedErrors = [];

    /**
     * Compare two BPMN XML documents
     * @returns diff result: {
     *   processNode,
     *   missingShapeIds, missingRowIds,
     *   changedShapeIds, changedRowIds,
     *   nodeIdToDiffsMap (id -> [property group names]),
     *   nodeIdToConditions (id -> [my condition, other condition]),
     *   nodeIdToMappingChanges (id -> Map(list group name -> [{label, changed}])),
     *   typeChangedIds (ids whose element type differs between the versions,
     *     or whose panel header text changes for another reason, e.g. cancelActivity
     *     or isInterrupting),
     *   subProcessWithChangesIds (subprocesses that are not changed themselves
     *     but contain an added, removed or changed element at any depth)
     * }
     */
    compare(myXml, otherXml) {
        const myDoc = parseXml(myXml);
        const otherDoc = parseXml(otherXml);

        this.#changedMessages =
            this.#findChangedReferencedElements(myDoc, otherDoc, BpmnXmlComparator.#MESSAGE_TAG_NAME);
        this.#changedEscalations =
            this.#findChangedReferencedElements(myDoc, otherDoc, BpmnXmlComparator.#ESCALATION_TAG_NAME);
        this.#changedErrors =
            this.#findChangedReferencedElements(myDoc, otherDoc, BpmnXmlComparator.#ERROR_TAG_NAME);

        // isExecutable only picks the main process out of a collaboration; it says
        // nothing about what is worth comparing. A file whose only process is not
        // executable (the properties panel can clear the flag) still has to be diffed,
        // and a file with no process at all yields an empty diff instead of throwing.
        const myProcessNode = this.#findMainProcessNode(myDoc);
        const myNodesWithIdAttr = myProcessNode ? myProcessNode.querySelectorAll('[id]') : [];

        const result = {
            processNode: myProcessNode,
            missingShapeIds: [],
            missingRowIds: [],
            changedShapeIds: [],
            changedRowIds: [],
            nodeIdToDiffsMap: new Map(),
            nodeIdToConditions: new Map(),
            nodeIdToMappingChanges: new Map(),
            typeChangedIds: [],
            subProcessWithChangesIds: []
        };

        for (const myNode of myNodesWithIdAttr) {
            if (this.#isFormFieldProperty(myNode)) {
                // Will compare form-field-properties as parts of bpmn:userTask nodes
                continue;
            }

            const id = myNode.getAttribute('id');
            const otherNode = otherDoc.getElementById(id);
            if (!otherNode) {
                if (this.#isNodeRow(myNode)) {
                    result.missingRowIds.push(id);
                } else {
                    result.missingShapeIds.push(id);
                }
            } else {
                if (myNode.tagName !== otherNode.tagName) {
                    // The element was replaced by another type. #compareNodes stops at
                    // the tag mismatch and names no properties, so the element would go
                    // blue with nothing in the panel saying what changed.
                    result.typeChangedIds.push(id);
                }
                const diffs = this.#compareNodes(null, myNode, otherNode);
                if (diffs) {
                    // console.debug(`nodes with id '${id}' have diffs: `, diffs);
                    for (const diff of diffs) {
                        const diffPropGroup = this.#findDiffPropertyGroup(diff);
                        if (diffPropGroup) {
                            if (diffPropGroup === BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP) {
                                continue;
                            }
                            if (diffPropGroup === BpmnXmlComparator.#HEADER_DIFF_PROPERTY_GROUP) {
                                if (!result.typeChangedIds.includes(id)) {
                                    result.typeChangedIds.push(id);
                                }
                                continue;
                            }
                            const diffsInMap = result.nodeIdToDiffsMap.get(id);
                            if (diffsInMap) {
                                result.nodeIdToDiffsMap.set(id, diffsInMap.concat(diffPropGroup));
                            } else {
                                result.nodeIdToDiffsMap.set(id, [diffPropGroup]);
                            }
                        } else {
                            console.warn(`nodes with id '${id}': property group not found for diff: ${diff}`);
                        }
                    }

                    this.#collectListGroupChanges(id, myNode, otherNode, result);

                    if (this.#isNodeRow(myNode)) {
                        result.changedRowIds.push(id);

                        if (myNode.tagName === 'bpmn:sequenceFlow') {
                            const myCondition = this.#findChildNodeByTagName(myNode, 'bpmn:conditionExpression');
                            const otherCondition = this.#findChildNodeByTagName(otherNode, 'bpmn:conditionExpression');
                            if (myCondition && otherCondition) {
                                result.nodeIdToConditions.set(
                                    id,
                                    [myCondition.textContent, otherCondition.textContent]
                                );
                            }
                        }
                    } else {
                        result.changedShapeIds.push(id);
                    }
                }
            }
        }

        result.subProcessWithChangesIds = this.#findSubProcessesWithChanges(myDoc, otherDoc, result);

        return result;
    }

    #findMainProcessNode(doc) {
        const processNodes = Array.from(doc.getElementsByTagName(BpmnXmlComparator.#PROCESS_TAG_NAME));
        return processNodes.find(elem => elem.getAttribute('isExecutable') === 'true') ?? processNodes[0];
    }

    // Subprocess children are compared on their own (see #compareNodes), so a change
    // inside never flags the subprocess itself, and a collapsed one would give no sign
    // of it. Collects the enclosing subprocesses of every differing element instead:
    // the shown side's added/changed ones and the elements only the other side has.
    #findSubProcessesWithChanges(myDoc, otherDoc, result) {
        const ids = new Set();
        const differingIds = [
            ...result.missingShapeIds, ...result.missingRowIds,
            ...result.changedShapeIds, ...result.changedRowIds
        ];
        for (const id of differingIds) {
            this.#addSubProcessAncestorIds(myDoc.getElementById(id), ids);
        }
        const otherProcessNode = this.#findMainProcessNode(otherDoc);
        for (const otherNode of otherProcessNode ? otherProcessNode.querySelectorAll('[id]') : []) {
            if (!this.#isFormFieldProperty(otherNode) && !myDoc.getElementById(otherNode.getAttribute('id'))) {
                this.#addSubProcessAncestorIds(otherNode, ids);
            }
        }
        // An added/removed subprocess already carries its own colour, and an ancestor
        // only the other side has is not on the shown diagram.
        return Array.from(ids).filter(id =>
            myDoc.getElementById(id) && !result.missingShapeIds.includes(id));
    }

    #addSubProcessAncestorIds(node, ids) {
        for (let child = node, parent = node.parentNode; parent; child = parent, parent = parent.parentNode) {
            if (parent.nodeType === Node.ELEMENT_NODE && this.#isSubProcess(parent)
                && !BpmnXmlComparator.#SUBPROCESS_OWN_CHILD_TAG_NAMES.includes(child.tagName)) {
                ids.add(parent.getAttribute('id'));
            }
        }
    }

    #findDiffPropertyGroup(diff) {
        const res = BpmnXmlComparator.#DIFF_TO_PROPERTY_GROUP_MAP.get(diff);
        if (res) {
            return res;
        }

        const diffShort = diff.slice(diff.indexOf('/') + 1);
        const shortRes = BpmnXmlComparator.#DIFF_TO_PROPERTY_GROUP_MAP.get(diffShort);
        if (shortRes || !diff.startsWith('zeebe:')) {
            return shortRes;
        }
        return BpmnXmlComparator.#DIFF_TO_PROPERTY_GROUP_MAP.get(diff.split('/')[0]);
    }

    // For each changed list-based group on this node (In/Out mappings, Inputs/Outputs),
    // records which individual entries differ so the panel can highlight them, not just
    // the whole group. An entry is keyed by its panel label; changed=true when it exists
    // in both versions but differs, changed=false when it exists only in the shown version
    // (added/removed, colored by which branch is shown).
    #collectListGroupChanges(id, myNode, otherNode, result) {
        const groups = result.nodeIdToDiffsMap.get(id);
        if (!groups) {
            return;
        }

        let changesForNode = null;
        for (const groupName of new Set(groups)) {
            const config = BpmnXmlComparator.#LIST_GROUP_CONFIG.get(groupName);
            if (!config) {
                continue;
            }
            const descriptors = this.#computeListGroupChanges(myNode, otherNode, config);
            if (descriptors.length === 0) {
                continue;
            }
            if (!changesForNode) {
                changesForNode = new Map();
            }
            changesForNode.set(groupName, descriptors);
        }

        if (changesForNode) {
            result.nodeIdToMappingChanges.set(id, changesForNode);
        }
    }

    #computeListGroupChanges(myNode, otherNode, config) {
        const myEntries = this.#extractListEntries(myNode, config);
        const otherEntries = this.#extractListEntries(otherNode, config);
        const descriptors = [];

        for (const myEntry of myEntries) {
            const label = myEntry.getAttribute(config.keyAttr);
            if (!label) {
                // No panel label to match the list item by; the whole-group highlight covers it
                continue;
            }
            const sameKey = otherEntries.filter(e => e.getAttribute(config.keyAttr) === label);
            if (sameKey.length === 0) {
                descriptors.push({ label, changed: false });
            } else if (!sameKey.some(e => markupOf(e) === markupOf(myEntry))) {
                descriptors.push({ label, changed: true });
            }
        }

        return descriptors;
    }

    #extractListEntries(node, config) {
        const ext = this.#findChildNodeByTagName(node, 'bpmn:extensionElements');
        if (!ext) {
            return [];
        }
        const containers = config.parentTag
            ? Array.from(ext.childNodes).filter(c => [].concat(config.parentTag).includes(c.tagName))
            : [ext];

        const entries = [];
        for (const container of containers) {
            for (const child of container.childNodes) {
                if (![].concat(config.tag).includes(child.tagName)) {
                    continue;
                }
                if (config.skip && config.skip(child)) {
                    continue;
                }
                entries.push(child);
            }
        }
        return entries;
    }

    #isNodeRow(node) {
        return BpmnXmlComparator.#ROW_TAG_NAMES.includes(node.tagName);
    }

    #isNodeConnector(node) {
        return BpmnXmlComparator.#CONNECTOR_TAG_NAMES.includes(node.tagName);
    }

    #isSubProcess(node) {
        return node.tagName === BpmnXmlComparator.#SUBPROCESS_TAG_NAME;
    }

    #isFormFieldProperty(node) {
        return node.tagName === 'camunda:property';
    }

    // Finds changed elements defined outside the process (messages, escalations, errors)
    // that diagram elements point to via reference attributes
    #findChangedReferencedElements(myDoc, otherDoc, tagName) {
        const changedIds = [];
        const myNodes = Array.from(myDoc.getElementsByTagName(tagName));

        for (const myNode of myNodes) {
            const id = myNode.getAttribute('id');
            const otherNode = otherDoc.getElementById(id);
            if (!otherNode) {
                continue;
            }
            const diffs = this.#compareNodes(null, myNode, otherNode);
            if (diffs) {
                changedIds.push(id);
            }
        }
        return changedIds;
    }

    /**
     * Compare nodes A and B
     * @returns null if the nodes are equal,
     * otherwise an array of property names that differ
     * or empty array if nodes are not equal but different properties are not defined
     */
    #compareNodes(parentNode, nodeA, nodeB) {
        // console.debug('compare nodes...', parentNode, nodeA, nodeB);

        if (nodeA.nodeType === Node.TEXT_NODE) {
            if (nodeB.nodeType === Node.TEXT_NODE) {
                if (this.#isTextContentEqual(parentNode, nodeA, nodeB)) {
                    return null;
                } else {
                    return [this.#diffNameOf(parentNode)];
                }
            }
            return []; // A is text but B is not text
        } else if (nodeB.nodeType === Node.TEXT_NODE) {
            return []; // A is not text but B is text
        }

        if (nodeA.tagName !== nodeB.tagName) {
            return []; // nodes have different type
        }

        if (this.#isNodeConnector(nodeA)) {
            // Do not compare connectors
            return null;
        }

        let diffs = this.#compareNodesAttributes(nodeA, nodeB);

        if (this.#isSubProcess(nodeA)) {
            // Do not compare children of subprocesses (they will be compared separately)
            // except the subprocess's own nodes
            for (const tagName of BpmnXmlComparator.#SUBPROCESS_OWN_CHILD_TAG_NAMES) {
                diffs = this.#concatDiffs(diffs, this.#compareChildNodesWithTagName(nodeA, nodeB, tagName));
            }
            return diffs;
        }

        if (this.#hasPositionalTagMismatch(nodeA, nodeB)) {
            // Children are logically an unordered set (e.g. a modeler re-saving the
            // file reorders them, or an extensionElements entry gets replaced with
            // child count unchanged): positional comparison would pair unrelated
            // nodes and yield nameless diffs, losing property groups for panel
            // highlighting (and, with no real content change, a false positive).
            const childrenDiffs = this.#findChildrenDiffs(nodeA, nodeB);
            return this.#concatDiffs(diffs, childrenDiffs);
        }

        const childrenA = this.#significantChildren(nodeA);
        const childrenB = this.#significantChildren(nodeB);
        if (childrenA.length !== childrenB.length) {
            const childrenDiffs = this.#findChildrenDiffs(nodeA, nodeB);
            diffs = this.#concatDiffs(diffs, childrenDiffs);
        } else {
            for (let i = 0; i < childrenA.length; i++) {
                const nodeDiffs = this.#compareNodes(nodeA, childrenA[i], childrenB[i]);
                diffs = this.#concatDiffs(diffs, nodeDiffs);
            }
        }

        return diffs;
    }

    // True when nodes have the same number of children but the tags
    // at some position differ, so positional comparison would pair unrelated nodes
    #hasPositionalTagMismatch(nodeA, nodeB) {
        const childrenA = this.#significantChildren(nodeA);
        const childrenB = this.#significantChildren(nodeB);
        if (childrenA.length !== childrenB.length) {
            return false;
        }
        for (let i = 0; i < childrenA.length; i++) {
            if (childrenA[i].tagName !== childrenB[i].tagName) {
                return true;
            }
        }
        return false;
    }

    // Indentation is not a change: the walk pairs children by position and the
    // set-based fallback matches subtrees by their markup, so a document that is
    // only formatted differently would otherwise read as changed on every element
    // that has children (bpmn-js writes both forms — saveXML() with and without
    // `format`). Text that is not pure whitespace is left alone.
    #significantChildren(node) {
        return Array.from(node.childNodes).filter(child => child.nodeType === Node.TEXT_NODE
            ? child.nodeValue.trim() !== ''
            : !this.#isEmptyExtension(child));
    }

    // An extension element with no attributes, no text and no significant children
    // carries no value, and the properties panel leaves exactly those behind: the
    // container of a list group survives the deletion of its last entry, and a field's
    // element survives its value being cleared. Restricted to the camunda and zeebe
    // namespaces (plus the extensionElements wrapper) because in the bpmn namespace bare
    // presence IS the value — bpmn:terminateEventDefinition and the other event
    // definitions — and so it is for zeebe:userTask (a Camunda user task, not a job
    // worker). Recurses through #significantChildren, so a container holding nothing
    // but empty extensions is empty too.
    #isEmptyExtension(node) {
        return (node.tagName.startsWith('camunda:') || node.tagName.startsWith('zeebe:')
                || node.tagName === 'bpmn:extensionElements')
            && node.tagName !== 'zeebe:userTask'
            && node.attributes.length === 0
            && this.#significantChildren(node).length === 0;
    }

    #isTextContentEqual(parentNode, nodeA, nodeB) {
        if (nodeA.textContent === nodeB.textContent) {
            return true;
        }
        // Script conditions (language="groovy", "python", ...) keep whitespace significant
        if (parentNode && !parentNode.hasAttribute('language') &&
            BpmnXmlComparator.#EXPRESSION_TAG_NAMES.includes(parentNode.tagName)) {
            return this.#normalizeExpression(nodeA.textContent) === this.#normalizeExpression(nodeB.textContent);
        }
        return false;
    }

    /**
     * Removes insignificant whitespace from an expression:
     * collapses it outside string literals, keeping a single space
     * only between word characters (to not merge keyword operators like 'a ne b')
     */
    #normalizeExpression(text) {
        let result = '';
        let quote = null;
        let escaped = false;
        let pendingSpace = false;

        for (const symbol of text) {
            if (quote) {
                result += symbol;
                if (escaped) {
                    escaped = false;
                } else if (symbol === '\\') {
                    escaped = true;
                } else if (symbol === quote) {
                    quote = null;
                }
                continue;
            }

            if (BpmnXmlComparator.#WHITESPACE_CHAR.test(symbol)) {
                pendingSpace = true;
                continue;
            }

            if (pendingSpace) {
                const lastSymbol = result[result.length - 1];
                if (lastSymbol &&
                    BpmnXmlComparator.#WORD_CHAR.test(lastSymbol) &&
                    BpmnXmlComparator.#WORD_CHAR.test(symbol)) {
                    result += ' ';
                }
                pendingSpace = false;
            }

            if (symbol === '"' || symbol === '\'') {
                quote = symbol;
            }
            result += symbol;
        }

        return result;
    }

    #concatDiffs(diffs, newDiffs) {
        if (!newDiffs) {
            return diffs;
        }
        if (diffs) {
            return diffs.concat(newDiffs);
        }
        return newDiffs;
    }

    #compareChildNodesWithTagName(nodeA, nodeB, tagName) {
        const childA = this.#findChildNodeByTagName(nodeA, tagName);
        const childB = this.#findChildNodeByTagName(nodeB, tagName);
        if (childA && childB) {
            return this.#compareNodes(nodeA, childA, childB);
        }
        if (childA) {
            return this.#nodeToDiffs(childA);
        }
        if (childB) {
            return this.#nodeToDiffs(childB);
        }
        return null;
    }

    #findChildNodeByTagName(node, tagName) {
        for (const child of node.childNodes) {
            if (child.tagName === tagName) {
                return child;
            }
        }
        return null;
    }

    #findChildrenDiffs(nodeA, nodeB) {
        const diffChildren = this.#findDifferentChilder(
            this.#significantChildren(nodeA), this.#significantChildren(nodeB));
        if (!diffChildren) {
            return null;
        }

        let diffs = [];
        for (let diffChild of diffChildren) {
            diffs = diffs.concat(this.#nodeToDiffs(diffChild));
        }

        return diffs;
    }

    #nodeToDiffs(node) {
        // console.debug('nodeToDiffs', node);
        if (BpmnXmlComparator.#CONTAINER_TAG_NAMES.includes(node.tagName)) {
            const children = this.#getAllNotTextChildren(node);
            // console.debug('getAllNotTextChildren res', children);
            let res = [];
            for (const child of children) {
                res = res.concat(this.#nodeToDiffs(child));
            }
            return res;
        }
        // camunda:in/out is a variable mapping only when it is neither the business key
        // nor the "all variables" propagation — the panel shows those in their own
        // groups, which is also why #LIST_GROUP_CONFIG skips them as list entries.
        if (node.tagName === 'camunda:in' && node.hasAttribute('businessKey')) {
            return ['camunda:in/businessKey'];
        }
        if ((node.tagName === 'camunda:in' || node.tagName === 'camunda:out')
                && node.getAttribute('variables') === 'all') {
            return [node.tagName + '/variables'];
        }
        return [this.#diffNameOf(node)];
    }

    // The same tag can belong to different panel groups depending on where it sits
    #diffNameOf(node) {
        if (node.tagName === 'camunda:failedJobRetryTimeCycle'
                && node.parentNode?.parentNode?.tagName === 'bpmn:multiInstanceLoopCharacteristics') {
            // the multi-instance body's own retries, not the activity's (Job execution)
            return 'bpmn:multiInstanceLoopCharacteristics/' + node.tagName;
        }
        return node.tagName;
    }

    #getAllNotTextChildren(node) {
        const res = this.#significantChildren(node).filter(child => child.nodeType !== Node.TEXT_NODE);
        if (res.length > 0) {
            return res;
        }
        console.warn('not text child not found');
        return [];
    }

    #findDifferentChilder(childrenA, childrenB) {
        let diffNodes = [];
        this.#pushOuterDiff(diffNodes, childrenA, childrenB);
        this.#pushOuterDiff(diffNodes, childrenB, childrenA);

        if (diffNodes.length > 0) {
            return diffNodes;
        }
        return null;
    }

    #pushOuterDiff(diffNodes, findForNodes, findWhereNodes) {
        for (const findForNode of findForNodes) {
            if (findForNode.nodeType === Node.TEXT_NODE || this.#isNodeConnector(findForNode)) {
                continue;
            }
            const findForNodeText = this.#markupIgnoringId(findForNode);
            let found = false;
            for (const findWhereNode of findWhereNodes) {
                if (findWhereNode.nodeType === Node.TEXT_NODE) {
                    continue; // text has no markup to match against
                }
                const findWhereNodeText = this.#markupIgnoringId(findWhereNode);
                if (findForNodeText === findWhereNodeText) {
                    found = true;
                    break;
                }
            }
            if (!found && !diffNodes.includes(findForNode)) {
                diffNodes.push(findForNode);
            }
        }
    }

    // Same idea as #getAttributesDiffs skipping 'id': a modeler can regenerate an
    // element's own auto id (moving it, or just re-saving with a newer version)
    // without changing anything semantic. markupOf() is otherwise exact, so a
    // reordered child that is byte-for-byte identical except for its own id (or a
    // descendant's) would still be reported as "different", losing its property
    // group for panel highlighting (it maps to no group, since nothing about it
    // actually changed).
    #markupIgnoringId(node) {
        return markupOf(node).replace(/ id="[^"]*"/g, '');
    }

    #compareNodesAttributes(nodeA, nodeB) {
        const nodeAAttrs = Array.from(nodeA.attributes);
        const nodeBAttrs = Array.from(nodeB.attributes);
        const diffs = [];

        this.#getAttributesDiffs(diffs, nodeA.tagName, nodeAAttrs, nodeBAttrs);
        this.#getAttributesDiffs(diffs, nodeB.tagName, nodeBAttrs, nodeAAttrs);

        if (diffs.length > 0) {
            return diffs;
        } else {
            return null;
        }
    }

    #getAttributesDiffs(diffs, nodeATagName, nodeAAttrs, nodeBAttrs) {
        // checks that all attributes of nodeA exist in nodeB and have the same value
        for (const attrA of nodeAAttrs) {
            const attName = attrA.name;
            // Skip:
            // - connectors attributes
            // - gateway's 'default' att
            // - 'id' att (it can belong to the messageEventDefinition elem)
            if (
                attName === 'targetRef' || attName === 'sourceRef' ||
                attName === 'default' ||
                attName === 'id'
            ) {
                continue;
            }

            // node.getAttribute(attName) not working and returns null, so uses method 'find'
            const attrB = nodeBAttrs.find(a => a.name === attName);
            const valueB = attrB ? attrB.value : BpmnXmlComparator.#ATTRIBUTE_DEFAULTS.get(attName);
            if (valueB === undefined || attrA.value !== valueB ||
                this.#isChangedMessageRef(attrA) || this.#isChangedEscalationRef(attrA) ||
                this.#isChangedErrorRef(attrA)) {
                const diff = nodeATagName + '/' + attName;
                if (!diffs.includes(diff)) {
                    diffs.push(diff);
                }
            }
        }
    }

    #isChangedMessageRef(attr) {
        return attr.name === 'messageRef' && this.#changedMessages.includes(attr.value);
    }

    #isChangedEscalationRef(attr) {
        return attr.name === 'escalationRef' && this.#changedEscalations.includes(attr.value);
    }

    #isChangedErrorRef(attr) {
        return attr.name === 'errorRef' && this.#changedErrors.includes(attr.value);
    }
}

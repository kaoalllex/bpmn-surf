// Semantic comparison of two BPMN XML documents.
// Produces a diff result object without touching the page DOM or bpmn-js.
class BpmnXmlComparator {
    static #PROCESS_TAG_NAME = 'bpmn:process';
    static #SUBPROCESS_TAG_NAME = 'bpmn:subProcess';
    static #MESSAGE_TAG_NAME = 'bpmn:message';
    static #ESCALATION_TAG_NAME = 'bpmn:escalation';

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

    static #IGNORED_DIFF_PROPERTY_GROUP = '_ignored_';

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

        ['camunda:collection', 'Multi-instance'],
        ['camunda:elementVariable', 'Multi-instance'],
        ['bpmn:loopCardinality', 'Multi-instance'],
        ['bpmn:completionCondition', 'Multi-instance'],
        //['camunda:failedJobRetryTimeCycle', 'Multi-instance'],

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

        ['camunda:out', 'Out mappings'],
        ['camunda:out/source', 'Out mappings'],
        ['camunda:out/target', 'Out mappings'],
        ['camunda:out/sourceExpression', 'Out mappings'],

        ['camunda:inputParameter', 'Inputs'],
        ['camunda:outputParameter', 'Outputs'],

        ['bpmn:escalationEventDefinition', 'Escalation'],
        ['bpmn:escalationEventDefinition/camunda:escalationCodeVariable', 'Escalation'],
        ['escalationRef', 'Escalation'],

        ['bpmn:error', 'Error'],

        ['camunda:executionListener', 'Execution listeners'],
        ['camunda:executionListener/delegateExpression', 'Execution listeners'],

        ['bpmn:timeDuration', 'Timer'],

        ['calledElement', 'Called element'],
        ['businessKey', 'Called element'],
        ['bpmn:callActivity/camunda:calledElementBinding', 'Called element'],

        ['camunda:jobPriority', 'Job execution'],
        ['camunda:failedJobRetryTimeCycle', 'Job execution'],

        ['camunda:properties', 'Extension properties'],

        ['camunda:formField', 'Form fields'],
        ['camunda:formField/label', 'Form fields'],

        ['messageRef', 'Message'],
        ['bpmn:messageEventDefinition', 'Message'],

        ['bpmn:documentation', 'Documentation'],

        // Properties to be ignored because there is no property group to highlight
        ['bpmn:terminateEventDefinition', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:multiInstanceLoopCharacteristics/isSequential', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:boundaryEvent/attachedToRef', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:outputSet', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],
        ['bpmn:inputSet', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP],

        ['bpmn:startEvent/isInterrupting', BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP]
    ]);

    #changedMessages = [];
    #changedEscalations = [];

    /**
     * Compare two BPMN XML documents
     * @returns diff result: {
     *   processNode,
     *   missingShapeIds, missingRowIds,
     *   changedShapeIds, changedRowIds,
     *   nodeIdToDiffsMap (id -> [property group names]),
     *   nodeIdToConditions (id -> [my condition, other condition]),
     *   nodeIdToMappingChanges (id -> Map(list group name -> [{label, changed}]))
     * }
     */
    compare(myXml, otherXml) {
        const myDoc = parseXml(myXml);
        const otherDoc = parseXml(otherXml);

        this.#changedMessages =
            this.#findChangedReferencedElements(myDoc, otherDoc, BpmnXmlComparator.#MESSAGE_TAG_NAME);
        this.#changedEscalations =
            this.#findChangedReferencedElements(myDoc, otherDoc, BpmnXmlComparator.#ESCALATION_TAG_NAME);

        const myProcessNode = Array.from(myDoc.getElementsByTagName(BpmnXmlComparator.#PROCESS_TAG_NAME))
            .filter(elem => elem.getAttribute('isExecutable') === 'true')[0];
        const myNodesWithIdAttr = myProcessNode.querySelectorAll('[id]');

        const result = {
            processNode: myProcessNode,
            missingShapeIds: [],
            missingRowIds: [],
            changedShapeIds: [],
            changedRowIds: [],
            nodeIdToDiffsMap: new Map(),
            nodeIdToConditions: new Map(),
            nodeIdToMappingChanges: new Map()
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
                const diffs = this.#compareNodes(null, myNode, otherNode);
                if (diffs) {
                    // console.debug(`nodes with id '${id}' have diffs: `, diffs);
                    for (const diff of diffs) {
                        const diffPropGroup = this.#findDiffPropertyGroup(diff);
                        if (diffPropGroup) {
                            if (diffPropGroup === BpmnXmlComparator.#IGNORED_DIFF_PROPERTY_GROUP) {
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

                        if (myNode.tagName === 'bpmn:sequenceFlow' &&
                            myNode.childNodes.length > 1 &&
                            otherNode.childNodes.length > 1) {
                            result.nodeIdToConditions.set(
                                id,
                                [myNode.childNodes[1].textContent, otherNode.childNodes[1].textContent]
                            );
                        }
                    } else {
                        result.changedShapeIds.push(id);
                    }
                }
            }
        }

        return result;
    }

    #findDiffPropertyGroup(diff) {
        const res = BpmnXmlComparator.#DIFF_TO_PROPERTY_GROUP_MAP.get(diff);
        if (res) {
            return res;
        }

        const diffShort = diff.slice(diff.indexOf('/') + 1);
        return BpmnXmlComparator.#DIFF_TO_PROPERTY_GROUP_MAP.get(diffShort);
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
            } else if (!sameKey.some(e => e.outerHTML === myEntry.outerHTML)) {
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
            ? Array.from(ext.childNodes).filter(c => c.tagName === config.parentTag)
            : [ext];

        const entries = [];
        for (const container of containers) {
            for (const child of container.childNodes) {
                if (child.tagName !== config.tag) {
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

    // Finds changed elements defined outside the process (messages, escalations)
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
                    return [parentNode.tagName];
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
            // except 'multiInstanceLoopCharacteristics' and 'extensionElements' nodes
            const milcDiffs = this.#compareChildNodesWithTagName(nodeA, nodeB, 'bpmn:multiInstanceLoopCharacteristics');
            diffs = this.#concatDiffs(diffs, milcDiffs);
            const extDiffs = this.#compareChildNodesWithTagName(nodeA, nodeB, 'bpmn:extensionElements');
            diffs = this.#concatDiffs(diffs, extDiffs);
            return diffs;
        }

        if (nodeA.tagName === 'bpmn:extensionElements' && this.#hasPositionalTagMismatch(nodeA, nodeB)) {
            // Extension elements are an unordered list: when an entry is replaced
            // (child count unchanged), positional comparison pairs unrelated entries
            // and yields nameless diffs, losing property groups for panel highlighting
            const childrenDiffs = this.#findChildrenDiffs(nodeA, nodeB);
            return this.#concatDiffs(diffs, childrenDiffs);
        }

        if (nodeA.childNodes.length !== nodeB.childNodes.length) {
            const childrenDiffs = this.#findChildrenDiffs(nodeA, nodeB);
            diffs = this.#concatDiffs(diffs, childrenDiffs);
        } else {
            for (let i = 0; i < nodeA.childNodes.length; i++) {
                const childA = nodeA.childNodes[i];
                const childB = nodeB.childNodes[i];
                const nodeDiffs = this.#compareNodes(nodeA, childA, childB);
                diffs = this.#concatDiffs(diffs, nodeDiffs);
            }
        }

        return diffs;
    }

    // True when nodes have the same number of children but the tags
    // at some position differ, so positional comparison would pair unrelated nodes
    #hasPositionalTagMismatch(nodeA, nodeB) {
        if (nodeA.childNodes.length !== nodeB.childNodes.length) {
            return false;
        }
        for (let i = 0; i < nodeA.childNodes.length; i++) {
            if (nodeA.childNodes[i].tagName !== nodeB.childNodes[i].tagName) {
                return true;
            }
        }
        return false;
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
        const diffChildren = this.#findDifferentChilder(nodeA.childNodes, nodeB.childNodes);
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
        if (node.tagName === 'bpmn:extensionElements' || node.tagName === 'camunda:inputOutput') {
            const children = this.#getAllNotTextChildren(node);
            // console.debug('getAllNotTextChildren res', children);
            let res = [];
            for (const child of children) {
                res = res.concat(this.#nodeToDiffs(child));
            }
            return res;
        }
        return [node.tagName];
    }

    #getAllNotTextChildren(node) {
        const res = [];
        for (const child of node.childNodes) {
            if (child.nodeType !== Node.TEXT_NODE) {
                res.push(child);
            }
        }
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
            const findForNodeText = findForNode.outerHTML;
            let found = false;
            for (const findWhereNode of findWhereNodes) {
                const findWhereNodeText = findWhereNode.outerHTML;
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
            if (!attrB || attrA.value !== attrB.value ||
                this.#isChangedMessageRef(attrA) || this.#isChangedEscalationRef(attrA)) {
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
}

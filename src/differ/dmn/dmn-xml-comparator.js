// Semantic comparison of two DMN decision table XML documents.
// Produces a diff model that is painted by DmnDiffPainter.
class DmnXmlComparator {
    compare(myXml, otherXml) {
        const myDoc = parseXml(myXml);
        const otherDoc = parseXml(otherXml);

        const myDecisionNode = myDoc.getElementsByTagName('decision')[0];
        const myDecisionTableNode = myDecisionNode.getElementsByTagName('decisionTable')[0];

        const otherDecisionNode = otherDoc.getElementsByTagName('decision')[0];
        const otherDecisionTableNode = otherDecisionNode.getElementsByTagName('decisionTable')[0];

        return {
            ...this.#compareHeader(myDecisionNode, myDecisionTableNode, otherDecisionNode, otherDecisionTableNode),
            ...this.#compareInputs(myDecisionTableNode, otherDoc),
            ...this.#compareOutputs(myDecisionTableNode, otherDoc),
            ...this.#compareRules(myDecisionTableNode, otherDoc)
        };
    }

    #compareHeader(myDecisionNode, myDecisionTableNode, otherDecisionNode, otherDecisionTableNode) {
        const headerDiffSelectors = []; // will contains html-elem class name
        if (myDecisionNode.getAttribute('name') !== otherDecisionNode.getAttribute('name')) {
            headerDiffSelectors.push("div.decision-table-name");
        }
        if (myDecisionTableNode.getAttribute('hitPolicy') !== otherDecisionTableNode.getAttribute('hitPolicy')) {
            headerDiffSelectors.push("span.hit-policy-value");
        }
        return { headerDiffSelectors };
    }

    #compareInputs(myDecisionTableNode, otherDoc) {
        const missingInputIds = [];
        const changedInputIds = [];
        const myInputNodes = myDecisionTableNode.getElementsByTagName('input');
        for (const myInputNode of myInputNodes) {
            const id = myInputNode.getAttribute('id');
            const otherInputNode = otherDoc.getElementById(id);

            if (!otherInputNode) {
                missingInputIds.push(id);
            }
            else {
                if (markupOf(myInputNode) !== markupOf(otherInputNode)) {
                    changedInputIds.push(id);
                }
            }
        }
        return { missingInputIds, changedInputIds };
    }

    #compareOutputs(myDecisionTableNode, otherDoc) {
        const missingOutputLabels = [];
        const changedOutputLabels = [];
        const myOutputNodes = myDecisionTableNode.getElementsByTagName('output');
        for (const myOutputNode of myOutputNodes) {
            const id = myOutputNode.getAttribute('id');
            const label = myOutputNode.getAttribute('label');
            const otherOutputNode = otherDoc.getElementById(id);

            if (!otherOutputNode) {
                missingOutputLabels.push(label);
            }
            else {
                if (markupOf(myOutputNode) !== markupOf(otherOutputNode)) {
                    changedOutputLabels.push(label);
                }
            }
        }
        return { missingOutputLabels, changedOutputLabels };
    }

    #compareRules(myDecisionTableNode, otherDoc) {
        const missingRuleIds = [];
        const changedRuleIdToDiffsMap = new Map();
        const myRuleNodes = myDecisionTableNode.getElementsByTagName('rule');

        for (const myRuleNode of myRuleNodes) {
            const id = myRuleNode.getAttribute('id');
            const otherRuleNode = otherDoc.getElementById(id);

            if (!otherRuleNode) {
                missingRuleIds.push(id);
            }
            else {
                const diffs = this.#compareRuleNodes(myRuleNode, otherRuleNode);
                if (diffs) {
                    // console.debug(`rule nodes with id '${id}' have diffs: `, diffs);
                    changedRuleIdToDiffsMap.set(id, diffs);
                }
            }
        }
        return { missingRuleIds, changedRuleIdToDiffsMap };
    }

    #compareRuleNodes(ruleNodeA, ruleNodeB) {
        const diffs = [];

        for (const childA of ruleNodeA.childNodes) {
            const tagChildA = childA.tagName;
            if (tagChildA === 'description') {
                const descrB = ruleNodeB.querySelector('description');
                if (descrB && childA.textContent !== descrB.textContent) {
                    diffs.push('description');
                }
            } else if (tagChildA === 'inputEntry' || tagChildA === 'outputEntry') {
                const entryId = childA.getAttribute('id');
                const entryB = ruleNodeB.querySelector(`[id="${entryId}"]`);
                if (entryB && markupOf(childA) !== markupOf(entryB)) {
                    diffs.push(entryId);
                }
            }
        }

        if (diffs.length > 0) {
            return diffs;
        } else {
            return null;
        }
    }
}

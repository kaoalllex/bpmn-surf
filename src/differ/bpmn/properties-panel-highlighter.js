// Highlights changed property groups in the bpmn-js properties panel
// and renders the formatted condition expression of a selected sequence flow
class PropertiesPanelHighlighter {
    static #CONDITION_DIV_ID = 'bpmnPropsCondition_12345bf3d4e842caa0d88194431197c0';

    #conditionFormatter;
    #isTargetBranchShownFunc;
    #elementRegistry = null;
    #nodeIdToDiffsMap = new Map();
    // Map: element id -> [current branch condition, other branch condition]
    #nodeIdToConditions = new Map();
    #highlightedPropGroups = null;
    #highlightedPropGroupElems = null;

    constructor(conditionFormatter, isTargetBranchShownFunc) {
        this.#conditionFormatter = conditionFormatter;
        this.#isTargetBranchShownFunc = isTargetBranchShownFunc;
    }

    init(elementRegistry) {
        this.#elementRegistry = elementRegistry;
    }

    setDiffData(nodeIdToDiffsMap, nodeIdToConditions) {
        this.#nodeIdToDiffsMap = nodeIdToDiffsMap;
        this.#nodeIdToConditions = nodeIdToConditions;
    }

    async highlightDiffPropGroups(elementId) {
        this.#resetHighlightedPropGroups();

        const diffPropGroups = this.#nodeIdToDiffsMap.get(elementId);
        if (diffPropGroups) {
            this.#highlightedPropGroups = diffPropGroups;
            this.#highlightedPropGroupElems = [];

            for (const diffPropGroup of this.#highlightedPropGroups) {
                const elem = await doWithAttempts(function () {
                    // The group title no longer carries a `title` attribute; match by header text instead
                    const titles = document.querySelectorAll('.bio-properties-panel-group-header-title');
                    for (const title of titles) {
                        if (title.textContent.trim() === diffPropGroup) {
                            return title.parentElement;
                        }
                    }
                    return null;
                });
                if (elem) {
                    this.#highlightedPropGroupElems.push(elem);
                    elem.style.backgroundColor = '#8888ff';
                } else {
                    console.warn(`property group header not found in panel, cannot highlight: "${diffPropGroup}" (element ${elementId})`);
                }
            }
        }
    }

    showConditionExpression(elementId) {
        const elem = this.#elementRegistry.get(elementId);
        if (elem.type !== 'bpmn:SequenceFlow') {
            return;
        }
        const conditionExpressionElem = document.querySelector('#bio-properties-panel-conditionExpression');
        if (!conditionExpressionElem) {
            return;
        }
        // Hide native expression container
        conditionExpressionElem.style.display = 'none';

        // Add new expression container, previously remove a possible duplicate
        removeElement(PropertiesPanelHighlighter.#CONDITION_DIV_ID);

        const div = document.createElement('div');
        div.id = PropertiesPanelHighlighter.#CONDITION_DIV_ID;
        div.className = 'properties-condition';
        conditionExpressionElem.parentElement.appendChild(div);
        this.#drawFormattedCondition(div, conditionExpressionElem, elementId);
    }

    #drawFormattedCondition(parentElem, conditionExpressionElem, elementId) {
        const conditions = this.#nodeIdToConditions.get(elementId);
        if (conditions) { // When comparing target branch and mr branches
            const myCondParts = this.#conditionFormatter.format(conditions[0]);
            const otherCondParts = this.#conditionFormatter.format(conditions[1]);

            for (const part of myCondParts) {
                const exists = otherCondParts.includes(part);
                this.#drawConditionPart(parentElem, part, exists);
            }
        } else { // When viewing target branch only
            const myCondParts = this.#conditionFormatter.format(conditionExpressionElem.value);
            for (const part of myCondParts) {
                this.#drawConditionPart(parentElem, part, true);
            }
        }
    }

    #drawConditionPart(parentElem, part, exists) {
        const elem = document.createElement('div');
        elem.style.whiteSpace = 'pre';
        elem.textContent = part;
        if (!exists) {
            let color = null;
            if (this.#isTargetBranchShownFunc()) {
                color = '#ff8888'; // The 'remove' color for branch
            } else {
                color = '#88ff88'; // The 'add' color for mr
            }
            elem.style.backgroundColor = color;
        }
        parentElem.appendChild(elem);
    }

    #resetHighlightedPropGroups() {
        this.#highlightedPropGroups = null;
        if (this.#highlightedPropGroupElems) {
            for (const elem of this.#highlightedPropGroupElems) {
                elem.style.backgroundColor = null;
            }
            this.#highlightedPropGroupElems = null;
        }
    }
}

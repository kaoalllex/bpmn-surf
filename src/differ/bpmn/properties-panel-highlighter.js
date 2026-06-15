// Highlights changed property groups in the bpmn-js properties panel
// and renders the formatted condition expression of a selected sequence flow
class PropertiesPanelHighlighter {
    static #CONDITION_DIV_ID = 'bpmnPropsCondition_12345bf3d4e842caa0d88194431197c0';

    static #GROUP_COLOR = '#8888ff'; // 'changed' color, also used for the whole-group marker
    static #CHANGE_COLOR = '#8888ff';
    static #ADD_COLOR = '#88ff88';
    static #REMOVE_COLOR = '#ff8888';

    #conditionFormatter;
    #isTargetBranchShownFunc;
    #elementRegistry = null;
    #nodeIdToDiffsMap = new Map();
    // Map: element id -> [current branch condition, other branch condition]
    #nodeIdToConditions = new Map();
    // Map: element id -> Map(list group name -> [{label, changed}])
    #nodeIdToMappingChanges = new Map();
    #highlightedElems = null;

    constructor(conditionFormatter, isTargetBranchShownFunc) {
        this.#conditionFormatter = conditionFormatter;
        this.#isTargetBranchShownFunc = isTargetBranchShownFunc;
    }

    init(elementRegistry) {
        this.#elementRegistry = elementRegistry;
    }

    setDiffData(nodeIdToDiffsMap, nodeIdToConditions, nodeIdToMappingChanges = new Map()) {
        this.#nodeIdToDiffsMap = nodeIdToDiffsMap;
        this.#nodeIdToConditions = nodeIdToConditions;
        this.#nodeIdToMappingChanges = nodeIdToMappingChanges;
    }

    async highlightDiffPropGroups(elementId) {
        this.#resetHighlightedPropGroups();

        const diffPropGroups = this.#nodeIdToDiffsMap.get(elementId);
        if (!diffPropGroups) {
            return;
        }
        this.#highlightedElems = [];
        const mappingChanges = this.#nodeIdToMappingChanges.get(elementId);

        for (const diffPropGroup of diffPropGroups) {
            const groupHeader = await this.#findGroupHeader(diffPropGroup);
            if (!groupHeader) {
                console.warn(`property group header not found in panel, cannot highlight: "${diffPropGroup}" (element ${elementId})`);
                continue;
            }
            // Always highlight the group header (the user's entry point in the group list)
            this.#paint(groupHeader, PropertiesPanelHighlighter.#GROUP_COLOR);

            // Additionally highlight the individual changed entries inside list groups
            const descriptors = mappingChanges && mappingChanges.get(diffPropGroup);
            if (descriptors) {
                this.#highlightListItems(groupHeader.parentElement, descriptors, elementId, diffPropGroup);
            }
        }
    }

    // The group header carries the title; its parent is the group container that also holds the list
    async #findGroupHeader(groupName) {
        return doWithAttempts(function () {
            // The group title no longer carries a `title` attribute; match by header text instead
            const titles = document.querySelectorAll('.bio-properties-panel-group-header-title');
            for (const title of titles) {
                if (title.textContent.trim() === groupName) {
                    return title.parentElement;
                }
            }
            return null;
        });
    }

    #highlightListItems(groupContainer, descriptors, elementId, groupName) {
        for (const descriptor of descriptors) {
            const itemHeaders = this.#findListItemHeaders(groupContainer, descriptor.label);
            if (itemHeaders.length === 0) {
                console.warn(`list item "${descriptor.label}" not found in group "${groupName}" (element ${elementId})`);
                continue;
            }
            const color = descriptor.changed
                ? PropertiesPanelHighlighter.#CHANGE_COLOR
                : (this.#isTargetBranchShownFunc()
                    ? PropertiesPanelHighlighter.#REMOVE_COLOR
                    : PropertiesPanelHighlighter.#ADD_COLOR);
            for (const itemHeader of itemHeaders) {
                this.#paint(itemHeader, color);
            }
        }
    }

    #findListItemHeaders(groupContainer, label) {
        const headers = [];
        const titles = groupContainer.querySelectorAll('.bio-properties-panel-collapsible-entry-header-title');
        for (const title of titles) {
            if (title.textContent.trim() === label) {
                headers.push(title.parentElement);
            }
        }
        return headers;
    }

    #paint(elem, color) {
        this.#highlightedElems.push(elem);
        elem.style.backgroundColor = color;
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
        if (this.#highlightedElems) {
            for (const elem of this.#highlightedElems) {
                elem.style.backgroundColor = null;
            }
            this.#highlightedElems = null;
        }
    }
}

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
                await this.#highlightListItems(groupHeader.parentElement, descriptors, elementId, diffPropGroup);
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

    async #highlightListItems(groupContainer, descriptors, elementId, groupName) {
        // The list entries render asynchronously (preact) a tick after the group
        // header, so an immediate lookup can miss them. Wait until the list has
        // populated before matching descriptors. The list renders all its current
        // items in one pass, so once any entry is present a descriptor still
        // missing is genuinely absent (graceful warn, no further wait).
        await doWithAttempts(() =>
            groupContainer.querySelector('.bio-properties-panel-collapsible-entry-header-title'));

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

    async showConditionExpression(elementId) {
        const elem = this.#elementRegistry.get(elementId);
        if (elem.type !== 'bpmn:SequenceFlow') {
            return;
        }
        // Unlike the group/list-item highlighting (which recolors panel nodes that
        // preact owns, so the color survives a re-render), here we INJECT a sibling
        // node next to the native condition input. The panel re-renders
        // asynchronously on selection (preact) and strips any foreign node during
        // reconciliation — so injecting once, too early, loses it (BUG-0011: the
        // removed delay(100) used to hide this; switching between sequence flows
        // re-exposed it). Inject and confirm the block survived a poll interval,
        // re-injecting until the panel settles. Re-query the input each attempt —
        // preact may swap the node when the selection changes.
        await doWithAttempts(() => {
            const existing = document.getElementById(PropertiesPanelHighlighter.#CONDITION_DIV_ID);
            if (existing && existing.dataset.conditionFor === elementId) {
                return existing; // survived the re-render → done
            }
            const conditionExpressionElem = document.querySelector('#bio-properties-panel-conditionExpression');
            if (!conditionExpressionElem) {
                return null; // not rendered yet
            }
            // Hide the native expression container and (re)draw the formatted one.
            conditionExpressionElem.style.display = 'none';
            removeElement(PropertiesPanelHighlighter.#CONDITION_DIV_ID);

            const div = document.createElement('div');
            div.id = PropertiesPanelHighlighter.#CONDITION_DIV_ID;
            div.dataset.conditionFor = elementId;
            div.className = 'properties-condition';
            conditionExpressionElem.parentElement.appendChild(div);
            this.#drawFormattedCondition(div, conditionExpressionElem, elementId);
            return null; // wait one interval to confirm the block survived
        }, 30, 50);
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

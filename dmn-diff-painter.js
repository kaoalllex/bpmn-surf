// Paints the diff model produced by DmnXmlComparator
// on the rendered dmn-js decision table DOM
class DmnDiffPainter {
    paint(diff, diffTypeForMissing) {
        this.#paintHeaderDiffs(diff.headerDiffSelectors);
        this.#paintInputDiffs(diffTypeForMissing, diff.missingInputIds, diff.changedInputIds);
        this.#paintOutputDiffs(diffTypeForMissing, diff.missingOutputLabels, diff.changedOutputLabels);
        this.#paintRulesDiffs(diffTypeForMissing, diff.missingRuleIds, diff.changedRuleIdToDiffsMap);
    }

    #paintHeaderDiffs(headerDiffSelectors) {
        if (headerDiffSelectors.length === 0) {
            return;
        }

        // console.debug(`header have diffs: ` + headerDiffSelectors);
        for (const headerDiff of headerDiffSelectors) {
            const cell = document.querySelector(headerDiff);
            if (cell) {
                cell.style.backgroundColor = DiffType.CHANGE.shapeColor;
            }
        }
    }

    #paintInputDiffs(diffTypeForMissing, missingInputIds, changedInputIds) {
        if (missingInputIds.length > 0) {
            // console.debug('missingInputIds', missingInputIds);
            for (const missingInputId of missingInputIds) {
                const cell = document.querySelector(`.input-cell[data-col-id="${missingInputId}"]`);
                if (cell) {
                    cell.style.backgroundColor = diffTypeForMissing.shapeColor;
                }
            }
        }

        if (changedInputIds.length > 0) {
            // console.debug('changedInputIds', changedInputIds);
            for (const changedInputId of changedInputIds) {
                const cell = document.querySelector(`.input-cell[data-col-id="${changedInputId}"]`);
                if (cell) {
                    cell.style.backgroundColor = DiffType.CHANGE.shapeColor;
                }
            }
        }
    }

    #paintOutputDiffs(diffTypeForMissing, missingOutputLabels, changedOutputLabels) {
        const outputLabelElems = Array.from(document.querySelectorAll('.output-label'));

        if (missingOutputLabels.length > 0) {
            // console.debug('missingOutputLabels', missingOutputLabels);
            for (const missingOutputLabel of missingOutputLabels) {
                const cell = outputLabelElems.find(e => e.textContent === missingOutputLabel);
                if (cell && cell.parentElement) {
                    cell.parentElement.style.backgroundColor = diffTypeForMissing.shapeColor;
                }
            }
        }

        if (changedOutputLabels.length > 0) {
            // console.debug('changedOutputLabels', changedOutputLabels);
            for (const changedOutputLabel of changedOutputLabels) {
                const cell = outputLabelElems.find(e => e.textContent === changedOutputLabel);
                if (cell && cell.parentElement) {
                    cell.parentElement.style.backgroundColor = DiffType.CHANGE.shapeColor;
                }
            }
        }
    }

    #paintRulesDiffs(diffTypeForMissing, missingRuleIds, changedRuleIdToDiffsMap) {
        if (missingRuleIds.length > 0) {
            // console.debug('missingRuleIds', missingRuleIds);

            for (const missingRuleId of missingRuleIds) {
                const ruleRow = this.#findRuleRowElem(missingRuleId);
                if (ruleRow) {
                    ruleRow.style.backgroundColor = diffTypeForMissing.shapeColor;
                }
            }
        }
        if (changedRuleIdToDiffsMap.size > 0) {
            // console.debug('changedRuleIdToDiffsMap', changedRuleIdToDiffsMap);

            for (const [ruleId, diffs] of changedRuleIdToDiffsMap) {
                const ruleRow = this.#findRuleRowElem(ruleId);
                if (ruleRow) {
                    for (const diff of diffs) {
                        const diffCell = this.#findDiffCell(ruleRow, diff);
                        if (diffCell) {
                            diffCell.style.backgroundColor = DiffType.CHANGE.shapeColor;
                        } else {
                            console.info(`cannot find diff cell '${diff}' of rule with id '${ruleId}'`);
                        }
                    }
                }
            }
        }
    }

    #findDiffCell(ruleRow, diff) {
        if (diff === 'description') {
            return ruleRow.querySelector(`.cell.annotation`);
        } else { // inputEntry/outputEntry id
            return ruleRow.querySelector(`[data-element-id="${diff}"]`);
        }
    }

    #findRuleRowElem(ruleId) {
        const ruleIndexCell = document.querySelector(`.rule-index[data-row-id="${ruleId}"]`);
        if (ruleIndexCell && ruleIndexCell.parentElement) {
            return ruleIndexCell.parentElement;
        } else {
            console.info('cannot find rule row elem by rule id: ' + ruleId);
            return null;
        }
    }
}

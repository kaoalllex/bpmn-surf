// Shows the name of the currently displayed branch in the differ header
class BranchIndicator {
    static TARGET_BRANCH_COLOR = 'darkred';
    static MR_BRANCH_COLOR = 'darkblue';

    #targetBranchName;
    #mrBranchName;
    #textNode = null;
    #spanElement = null;

    constructor(targetBranchName, mrBranchName) {
        this.#targetBranchName = targetBranchName;
        this.#mrBranchName = mrBranchName;
    }

    createElement() {
        this.#textNode = document.createTextNode('');
        this.#spanElement = document.createElement('span');
        this.#spanElement.style.fontSize = '20px';
        this.#spanElement.style.fontWeight = 'bold';
        this.#spanElement.style.color = BranchIndicator.MR_BRANCH_COLOR;
        this.#spanElement.style.whiteSpace = 'nowrap';
        this.#spanElement.appendChild(this.#textNode);
        return this.#spanElement;
    }

    setBranchName(branchName) {
        if (branchName === this.#targetBranchName) {
            this.#textNode.textContent = this.#targetBranchName;
            this.#spanElement.style.color = BranchIndicator.TARGET_BRANCH_COLOR;
        } else {
            this.#textNode.textContent = this.#mrBranchName;
            this.#spanElement.style.color = BranchIndicator.MR_BRANCH_COLOR;
        }
    }

    isTargetBranchShown() {
        return this.#textNode.textContent === this.#targetBranchName;
    }
}

// Shows the label of the currently displayed diagram version in the differ
// header, plus a role word so the side is clear without relying on colour:
// the target side is the "Original" (base) version, the source side is the
// "Changed" version. The labels themselves are plain, platform-neutral strings
// supplied by the producing provider (branch names for a whole-change diff, or
// commit message + short id for a single selected commit); this class only
// renders and toggles between the two sides.
class BranchIndicator {
    static TARGET_BRANCH_COLOR = 'darkred';
    static MR_BRANCH_COLOR = 'darkblue';
    static TARGET_ROLE = 'Original';
    static SOURCE_ROLE = 'Changed';
    // Muted style + note for a side where the file does not exist (UX-0003):
    // the absence is signalled here, in the label, rather than by a banner.
    // The wording is side-specific: the opposite side always exists (otherwise
    // the both-absent case would apply), so an absent source means the file was
    // deleted in the MR, and an absent target means it is a new file.
    static ABSENT_COLOR = 'gray';
    static ABSENT_NOTE_DELETED = 'file deleted';     // source/Changed side absent
    static ABSENT_NOTE_NEW = 'file does not exist';  // target/Original side absent

    #targetLabel;
    #sourceLabel;
    #textNode = null;
    #spanElement = null;
    #targetShown = false;

    constructor(targetLabel, sourceLabel) {
        this.#targetLabel = targetLabel;
        this.#sourceLabel = sourceLabel;
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

    setShownLabel(label) {
        this.#targetShown = label === this.#targetLabel;
        this.#spanElement.style.fontStyle = 'normal';
        if (this.#targetShown) {
            this.#textNode.textContent = this.#withRole(BranchIndicator.TARGET_ROLE, this.#targetLabel);
            this.#spanElement.style.color = BranchIndicator.TARGET_BRANCH_COLOR;
        } else {
            this.#textNode.textContent = this.#withRole(BranchIndicator.SOURCE_ROLE, this.#sourceLabel);
            this.#spanElement.style.color = BranchIndicator.MR_BRANCH_COLOR;
        }
    }

    // Marks the currently shown side as having no diagram in this version
    // (the file is new or was deleted). Keeps isTargetBranchShown() correct so
    // Download and a subsequent Switch still target the right side.
    setAbsentLabel(targetSide) {
        this.#targetShown = targetSide;
        const role = targetSide ? BranchIndicator.TARGET_ROLE : BranchIndicator.SOURCE_ROLE;
        const label = targetSide ? this.#targetLabel : this.#sourceLabel;
        const note = targetSide ? BranchIndicator.ABSENT_NOTE_NEW : BranchIndicator.ABSENT_NOTE_DELETED;
        this.#textNode.textContent = `${this.#withRole(role, label)} · ${note}`;
        this.#spanElement.style.color = BranchIndicator.ABSENT_COLOR;
        this.#spanElement.style.fontStyle = 'italic';
    }

    isTargetBranchShown() {
        return this.#targetShown;
    }

    // The role word only makes sense when there are two sides to tell apart;
    // in a single-version view (branch file, no source side) just show the label.
    #withRole(role, label) {
        return this.#sourceLabel ? `${role} · ${label}` : label;
    }
}

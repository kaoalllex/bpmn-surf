'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { BranchIndicator } = createScope();

describe('BranchIndicator — two-sided diff', () => {
    function build() {
        const indicator = new BranchIndicator('master', 'feature/x');
        const element = indicator.createElement();
        return { indicator, element };
    }

    it('shows the target side as "Original" in the target colour', () => {
        const { indicator, element } = build();
        indicator.setShownLabel('master');
        assert.equal(element.textContent, 'Original · master');
        assert.equal(element.style.color, BranchIndicator.TARGET_BRANCH_COLOR);
        assert.equal(indicator.isTargetBranchShown(), true);
    });

    it('shows the source side as "Changed" in the source colour', () => {
        const { indicator, element } = build();
        indicator.setShownLabel('feature/x');
        assert.equal(element.textContent, 'Changed · feature/x');
        assert.equal(element.style.color, BranchIndicator.MR_BRANCH_COLOR);
        assert.equal(indicator.isTargetBranchShown(), false);
    });

    it('tracks the shown side across toggles', () => {
        const { indicator } = build();
        indicator.setShownLabel('master');
        assert.equal(indicator.isTargetBranchShown(), true);
        indicator.setShownLabel('feature/x');
        assert.equal(indicator.isTargetBranchShown(), false);
        indicator.setShownLabel('master');
        assert.equal(indicator.isTargetBranchShown(), true);
    });

    it('keeps the role prefix with commit-message labels', () => {
        const indicator = new BranchIndicator(
            'TASK-13180: base (17fe556d)',
            'TASK-13197: change (d72d870a)'
        );
        const element = indicator.createElement();
        indicator.setShownLabel('TASK-13197: change (d72d870a)');
        assert.equal(element.textContent, 'Changed · TASK-13197: change (d72d870a)');
    });
});

describe('BranchIndicator — absent side (file new or deleted)', () => {
    function build() {
        const indicator = new BranchIndicator('master', 'feature/x');
        const element = indicator.createElement();
        return { indicator, element };
    }

    it('marks an absent target side as a not-yet-existing (new) file', () => {
        const { indicator, element } = build();
        indicator.setAbsentLabel(true);
        assert.equal(element.textContent, `Original · master · ${BranchIndicator.ABSENT_NOTE_NEW}`);
        assert.equal(indicator.isTargetBranchShown(), true);
    });

    it('marks an absent source side as a deleted file', () => {
        const { indicator, element } = build();
        indicator.setAbsentLabel(false);
        assert.equal(element.textContent, `Changed · feature/x · ${BranchIndicator.ABSENT_NOTE_DELETED}`);
        assert.equal(indicator.isTargetBranchShown(), false);
    });

    it('uses distinct wording for the new-file and deleted-file cases', () => {
        assert.notEqual(BranchIndicator.ABSENT_NOTE_NEW, BranchIndicator.ABSENT_NOTE_DELETED);
    });

    it('renders the absent label in a muted italic style', () => {
        const { indicator, element } = build();
        indicator.setAbsentLabel(false);
        assert.equal(element.style.color, BranchIndicator.ABSENT_COLOR);
        assert.equal(element.style.fontStyle, 'italic');
    });

    it('restores the normal (non-italic) style when switching back to a shown side', () => {
        const { indicator, element } = build();
        indicator.setAbsentLabel(true);
        indicator.setShownLabel('feature/x');
        assert.equal(element.textContent, 'Changed · feature/x');
        assert.equal(element.style.fontStyle, 'normal');
        assert.equal(element.style.color, BranchIndicator.MR_BRANCH_COLOR);
        assert.equal(indicator.isTargetBranchShown(), false);
    });
});

describe('BranchIndicator — single-version view (no source side)', () => {
    it('still shows the "Original" role prefix when there is no source side', () => {
        const indicator = new BranchIndicator('master', null);
        const element = indicator.createElement();
        indicator.setShownLabel('master');
        assert.equal(element.textContent, 'Original · master');
        assert.equal(indicator.isTargetBranchShown(), true);
    });

    it('prefixes a bare commit sha so it is not shown unlabelled', () => {
        const sha = '0123456789abcdef0123456789abcdef01234567';
        const indicator = new BranchIndicator(sha, null);
        const element = indicator.createElement();
        indicator.setShownLabel(sha);
        assert.equal(element.textContent, `Original · ${sha}`);
    });
});

describe('BranchIndicator — local-file diff ("Diff with local")', () => {
    function build() {
        const indicator = new BranchIndicator('master', 'invoice.bpmn', true);
        const element = indicator.createElement();
        return { indicator, element };
    }

    it('labels the source side "Local" with the uploaded file name', () => {
        const { indicator, element } = build();
        indicator.setShownLabel('invoice.bpmn');
        assert.equal(element.textContent, 'Local · invoice.bpmn');
        assert.equal(element.style.color, BranchIndicator.MR_BRANCH_COLOR);
        assert.equal(indicator.isTargetBranchShown(), false);
    });

    it('keeps the target side as "Original"', () => {
        const { indicator, element } = build();
        indicator.setShownLabel('master');
        assert.equal(element.textContent, 'Original · master');
        assert.equal(indicator.isTargetBranchShown(), true);
    });

    it('uses the "Changed" role (not "Local") for an ordinary branch source', () => {
        const indicator = new BranchIndicator('master', 'feature/x');
        const element = indicator.createElement();
        indicator.setShownLabel('feature/x');
        assert.equal(element.textContent, 'Changed · feature/x');
    });
});

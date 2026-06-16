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

describe('BranchIndicator — single-version view (no source side)', () => {
    it('omits the role prefix when there is no source side', () => {
        const indicator = new BranchIndicator('master', null);
        const element = indicator.createElement();
        indicator.setShownLabel('master');
        assert.equal(element.textContent, 'master');
        assert.equal(indicator.isTargetBranchShown(), true);
    });
});

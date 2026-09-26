'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

// GitLabUIRepoProvider.addButton works on the realm's global document, so each
// test gets a fresh scope with the relevant MR header markup.

// GitLab.com renders the MR sticky header inside .merge-request-sticky-header-wrapper.
function gitlabComHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header-wrapper js-merge-request-sticky-header-wrapper">
                        <div class="merge-request-sticky-header gl-border-b">
                            <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative gl-gap-2 is-merge-request js-tabs-affix">
                                <ul class="merge-request-tabs"></ul>
                                <div class="merge-request-tabs-actions"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

// Self-managed GitLab (gitlab.example.com): sticky header is a direct child of issuable-details.
function selfManagedHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header gl-border-b">
                        <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative is-merge-request js-tabs-affix">
                            <ul class="merge-request-tabs"></ul>
                            <div class="merge-request-tabs-actions"></div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

// GitLab renders the .is-merge-request marker only when the user's "Layout width"
// preference is Fixed, so with Fluid layout the tabs container has no such class.
function fluidLayoutHeaderMarkup() {
    return `
        <main id="content-body">
            <div class="merge-request">
                <div class="merge-request-details issuable-details">
                    <div class="merge-request-sticky-header-wrapper js-merge-request-sticky-header-wrapper">
                        <div class="merge-request-sticky-header gl-border-b">
                            <div class="merge-request-tabs-container gl-flex gl-justify-between gl-relative gl-gap-2 js-tabs-affix">
                                <ul class="merge-request-tabs"></ul>
                                <div class="merge-request-tabs-actions"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>`;
}

function addDiffButton(scope, fileType) {
    const provider = new scope.GitLabUIRepoProvider();
    provider.addButton({
        fileType,
        buttonType: scope.UI_BUTTON_TYPE.DIFF,
        needToSelectLocalFile: false,
        onButtonClickFunc: () => {}
    });
    return provider;
}

function diffButton(document) {
    return [...document.querySelectorAll('button')]
        .find(b => b.textContent === 'Schema diff' || b.textContent === 'Decision diff');
}

describe('GitLabUIRepoProvider.isAvailable', () => {
    it('handles the gitlab platform kind and nothing else', () => {
        const scope = createScope();
        const provider = new scope.GitLabUIRepoProvider();
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITLAB), true);
        assert.equal(provider.isAvailable(scope.PLATFORM_KIND.GITHUB), false);
        assert.equal(provider.isAvailable(null), false);
    });
});

describe('GitLabUIRepoProvider.addButton — DIFF', () => {
    it('inserts the button into the gitlab.com header (wrapped sticky header)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.equal(button.textContent, 'Schema diff');
        assert.ok(
            button.closest('.merge-request-tabs-actions'),
            'button should live inside the tabs-actions container'
        );
    });

    it('inserts the button into the self-managed header (direct sticky header)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = selfManagedHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.ok(button.closest('.merge-request-tabs-actions'));
    });

    it('inserts the button into the fluid-layout header (no .is-merge-request marker)', () => {
        const scope = createScope();
        scope.document.body.innerHTML = fluidLayoutHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_BPMN);

        const button = diffButton(scope.document);
        assert.ok(button, 'button should be inserted');
        assert.ok(button.closest('.merge-request-tabs-actions'));
    });

    it('labels the button "Decision diff" for DMN', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();

        addDiffButton(scope, scope.FILE_TYPE_DMN);

        assert.equal(diffButton(scope.document).textContent, 'Decision diff');
    });

    it('does nothing (and does not throw) when no known container is present', () => {
        const scope = createScope();
        scope.document.body.innerHTML = '<div class="unrelated"></div>';

        assert.doesNotThrow(() => addDiffButton(scope, scope.FILE_TYPE_BPMN));
        assert.equal(diffButton(scope.document), undefined);
    });
});

describe('GitLabUIRepoProvider disable/enable', () => {
    it('disables and re-enables the button in place, without removing it', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();
        const provider = addDiffButton(scope, scope.FILE_TYPE_BPMN);

        provider.disableButton();
        assert.equal(diffButton(scope.document).disabled, true);

        provider.enableButton();
        assert.equal(diffButton(scope.document).disabled, false);
        assert.ok(diffButton(scope.document), 'button should still be the same element, not rebuilt');
    });

    it('does nothing (and does not throw) when there is no button', () => {
        const scope = createScope();
        scope.document.body.innerHTML = gitlabComHeaderMarkup();
        const provider = new scope.GitLabUIRepoProvider();

        assert.doesNotThrow(() => provider.disableButton());
        assert.doesNotThrow(() => provider.enableButton());
    });
});

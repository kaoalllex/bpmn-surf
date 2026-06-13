'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('./support/scope.js');

const { ExternalTaskHandlerLocator } = createScope();

describe('ExternalTaskHandlerLocator.extractSubscriptionTopics', () => {
    it('extracts a single topic from a Kotlin handler', () => {
        const content = `
@Component("Order_PrepareItem_ScoreItem")
@ExternalTaskSubscription("Order_PrepareItem_ScoreItem")
class ScoreCarTask : BaseExternalTaskHandler<ItemPrepareContext>()
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['Order_PrepareItem_ScoreItem']
        );
    });

    it('ignores @Component and only returns @ExternalTaskSubscription topics', () => {
        const content = `
@Component("some-bean-name")
@ExternalTaskSubscription("the-topic")
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['the-topic']
        );
    });

    it('extracts multiple subscriptions from one file', () => {
        const content = `
@ExternalTaskSubscription("topic-a")
class A
@ExternalTaskSubscription("topic-b")
class B
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['topic-a', 'topic-b']
        );
    });

    it('tolerates whitespace and line breaks inside the annotation', () => {
        const content = '@ExternalTaskSubscription(\n    "spaced-topic"\n)';
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['spaced-topic']
        );
    });

    it('supports a named argument form', () => {
        const content = '@ExternalTaskSubscription(topicName = "named-topic")';
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['named-topic']
        );
    });

    it('matches the annotation without a leading @ (e.g. inside a search snippet)', () => {
        const content = 'ExternalTaskSubscription("snippet-topic")';
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(content)),
            ['snippet-topic']
        );
    });

    it('returns an empty array when there is no subscription', () => {
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics('class Plain')),
            []
        );
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics('')), []);
        assert.deepEqual(Array.from(ExternalTaskHandlerLocator.extractSubscriptionTopics(null)), []);
    });
});

describe('ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics', () => {
    it('derives the topic from the class name with a lower-cased first letter', () => {
        const content = `
@Component
@WrapToExternalTask(retriesTimeout = DEFAULT_RETRIES_TIMEOUT_FOR_CASHLOAN_EXTERNAL_TASK)
class CorrectItemABTestDelegate(
    private val abTestsAccessor: AbTestsAccessor,
) : AbstractDelegate() {
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['correctItemABTestDelegate']
        );
    });

    it('supports the annotation without arguments', () => {
        const content = `
@WrapToExternalTask
class FooBarDelegate : AbstractDelegate()
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['fooBarDelegate']
        );
    });

    it('tolerates modifiers and other annotations before the class', () => {
        const content = `
@WrapToExternalTask
@Component
open class FooDelegate
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['fooDelegate']
        );
    });

    it('matches the annotation without a leading @ (e.g. inside a search snippet)', () => {
        const content = 'WrapToExternalTask\nclass SnippetDelegate';
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['snippetDelegate']
        );
    });

    it('extracts multiple wrapped handlers from one file', () => {
        const content = `
@WrapToExternalTask
class AlphaDelegate
@WrapToExternalTask(retriesTimeout = X)
class BetaDelegate
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['alphaDelegate', 'betaDelegate']
        );
    });

    it('returns an empty array when there is no @WrapToExternalTask', () => {
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics('class Plain')),
            []
        );
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics('')), []);
        assert.deepEqual(Array.from(ExternalTaskHandlerLocator.extractWrapToExternalTaskTopics(null)), []);
    });
});

describe('ExternalTaskHandlerLocator.extractHandlerTopics', () => {
    it('combines @ExternalTaskSubscription and @WrapToExternalTask topics', () => {
        const content = `
@ExternalTaskSubscription("explicit-topic")
class ExplicitTask
@WrapToExternalTask
class DerivedDelegate
`;
        assert.deepEqual(
            Array.from(ExternalTaskHandlerLocator.extractHandlerTopics(content)),
            ['explicit-topic', 'derivedDelegate']
        );
    });

    it('returns an empty array for empty content', () => {
        assert.deepEqual(Array.from(ExternalTaskHandlerLocator.extractHandlerTopics('')), []);
    });
});

describe('ExternalTaskHandlerLocator.isHandlerFile', () => {
    it('accepts Kotlin files', () => {
        assert.equal(ExternalTaskHandlerLocator.isHandlerFile('src/main/kotlin/prepare/ScoreCarTask.kt'), true);
    });

    it('rejects BPMN and other files', () => {
        assert.equal(ExternalTaskHandlerLocator.isHandlerFile('src/main/resources/bpmn/PrepareItem.bpmn'), false);
        assert.equal(ExternalTaskHandlerLocator.isHandlerFile('README.md'), false);
    });
});

describe('ExternalTaskHandlerLocator.extractHandlerFileChanges', () => {
    it('classifies an added handler file as "added", scanned at its own path', () => {
        const response = {
            changes: [
                { old_path: 'src/NewTask.kt', new_path: 'src/NewTask.kt', new_file: true }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/NewTask.kt', scanPath: 'src/NewTask.kt', diffType: 'added' }]
        );
    });

    it('classifies a modified handler file as "changed"', () => {
        const response = {
            changes: [
                { old_path: 'src/ScoreCarTask.kt', new_path: 'src/ScoreCarTask.kt' }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/ScoreCarTask.kt', scanPath: 'src/ScoreCarTask.kt', diffType: 'changed' }]
        );
    });

    it('classifies a renamed file as "changed" using the new path', () => {
        const response = {
            changes: [
                { old_path: 'src/OldName.kt', new_path: 'src/NewName.kt', renamed_file: true }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/NewName.kt', scanPath: 'src/NewName.kt', diffType: 'changed' }]
        );
    });

    it('classifies a deleted handler file as "removed" using the old path', () => {
        const response = {
            changes: [
                { old_path: 'src/Gone.kt', new_path: 'src/Gone.kt', deleted_file: true }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/Gone.kt', scanPath: 'src/Gone.kt', diffType: 'removed' }]
        );
    });

    it('ignores non-handler files', () => {
        const response = {
            changes: [
                { old_path: 'src/Flow.bpmn', new_path: 'src/Flow.bpmn' },
                { old_path: 'README.md', new_path: 'README.md', new_file: true },
                { old_path: 'src/Task.kt', new_path: 'src/Task.kt' }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/Task.kt', scanPath: 'src/Task.kt', diffType: 'changed' }]
        );
    });

    it('returns empty for missing changes', () => {
        assert.deepEqual(JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges({}))), []);
        assert.deepEqual(JSON.parse(JSON.stringify(ExternalTaskHandlerLocator.extractHandlerFileChanges(null))), []);
    });
});

describe('ExternalTaskHandlerLocator URL builders', () => {
    const locator = new ExternalTaskHandlerLocator(
        'https://gitlab.example/group/proj',
        'https://gitlab.example',
        42
    );

    it('builds a blob file URL anchored to a line', () => {
        assert.equal(
            locator.blobFileUrl('src/A.kt', 18, 'abc123'),
            'https://gitlab.example/group/proj/-/blob/abc123/src/A.kt#L18'
        );
    });

    it('omits the line anchor when no line is given', () => {
        assert.equal(
            locator.blobFileUrl('src/A.kt', null, 'abc123'),
            'https://gitlab.example/group/proj/-/blob/abc123/src/A.kt'
        );
    });

    it('builds a blob search page URL', () => {
        assert.equal(
            locator.blobSearchPageUrl('my-topic', 'main'),
            'https://gitlab.example/group/proj/-/search?search=my-topic&scope=blobs&ref=main'
        );
    });
});

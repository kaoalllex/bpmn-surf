'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { HandlerLocator } = createScope();

describe('HandlerLocator.extractSubscriptionTopics', () => {
    it('extracts a single topic from a Kotlin handler', () => {
        const content = `
@Component("Order_PrepareItem_ScoreItem")
@ExternalTaskSubscription("Order_PrepareItem_ScoreItem")
class ScoreCarTask : BaseExternalTaskHandler<ItemPrepareContext>()
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
            ['Order_PrepareItem_ScoreItem']
        );
    });

    it('ignores @Component and only returns @ExternalTaskSubscription topics', () => {
        const content = `
@Component("some-bean-name")
@ExternalTaskSubscription("the-topic")
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
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
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
            ['topic-a', 'topic-b']
        );
    });

    it('tolerates whitespace and line breaks inside the annotation', () => {
        const content = '@ExternalTaskSubscription(\n    "spaced-topic"\n)';
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
            ['spaced-topic']
        );
    });

    it('supports a named argument form', () => {
        const content = '@ExternalTaskSubscription(topicName = "named-topic")';
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
            ['named-topic']
        );
    });

    it('matches the annotation without a leading @ (e.g. inside a search snippet)', () => {
        const content = 'ExternalTaskSubscription("snippet-topic")';
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics(content)),
            ['snippet-topic']
        );
    });

    it('returns an empty array when there is no subscription', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractSubscriptionTopics('class Plain')),
            []
        );
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractSubscriptionTopics('')), []);
        assert.deepEqual(Array.from(HandlerLocator.extractSubscriptionTopics(null)), []);
    });
});

describe('HandlerLocator.extractWrapToExternalTaskTopics', () => {
    it('derives the topic from the class name with a lower-cased first letter', () => {
        const content = `
@Component
@WrapToExternalTask(retriesTimeout = DEFAULT_RETRIES_TIMEOUT_FOR_CASHLOAN_EXTERNAL_TASK)
class CorrectItemABTestDelegate(
    private val abTestsAccessor: AbTestsAccessor,
) : AbstractDelegate() {
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['correctItemABTestDelegate']
        );
    });

    it('supports the annotation without arguments', () => {
        const content = `
@WrapToExternalTask
class FooBarDelegate : AbstractDelegate()
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics(content)),
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
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['fooDelegate']
        );
    });

    it('matches the annotation without a leading @ (e.g. inside a search snippet)', () => {
        const content = 'WrapToExternalTask\nclass SnippetDelegate';
        assert.deepEqual(
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics(content)),
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
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics(content)),
            ['alphaDelegate', 'betaDelegate']
        );
    });

    it('returns an empty array when there is no @WrapToExternalTask', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractWrapToExternalTaskTopics('class Plain')),
            []
        );
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractWrapToExternalTaskTopics('')), []);
        assert.deepEqual(Array.from(HandlerLocator.extractWrapToExternalTaskTopics(null)), []);
    });
});

describe('HandlerLocator.extractHandlerTopics', () => {
    it('combines @ExternalTaskSubscription and @WrapToExternalTask topics', () => {
        const content = `
@ExternalTaskSubscription("explicit-topic")
class ExplicitTask
@WrapToExternalTask
class DerivedDelegate
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractHandlerTopics(content)),
            ['explicit-topic', 'derivedDelegate']
        );
    });

    it('returns an empty array for empty content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractHandlerTopics('')), []);
    });
});

describe('HandlerLocator.isHandlerFile', () => {
    it('accepts Kotlin files', () => {
        assert.equal(HandlerLocator.isHandlerFile('src/main/kotlin/prepare/ScoreCarTask.kt'), true);
    });

    it('accepts Java files', () => {
        assert.equal(HandlerLocator.isHandlerFile('src/main/java/prepare/ScoreCarDelegate.java'), true);
    });

    it('rejects BPMN and other files', () => {
        assert.equal(HandlerLocator.isHandlerFile('src/main/resources/bpmn/PrepareItem.bpmn'), false);
        assert.equal(HandlerLocator.isHandlerFile('README.md'), false);
    });
});

describe('HandlerLocator.extractHandlerFileChanges', () => {
    it('classifies an added handler file as "added", scanned at its own path', () => {
        const response = {
            changes: [
                { old_path: 'src/NewTask.kt', new_path: 'src/NewTask.kt', new_file: true }
            ]
        };
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(response))),
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
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(response))),
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
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(response))),
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
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(response))),
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
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(response))),
            [{ filePath: 'src/Task.kt', scanPath: 'src/Task.kt', diffType: 'changed' }]
        );
    });

    it('returns empty for missing changes', () => {
        assert.deepEqual(JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges({}))), []);
        assert.deepEqual(JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(null))), []);
    });
});

describe('HandlerLocator URL builders', () => {
    const locator = new HandlerLocator(
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

describe('HandlerLocator.extractDeclaredClassNames', () => {
    it('extracts a single Kotlin class name', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractDeclaredClassNames('class ScoreCarDelegate : AbstractDelegate()')),
            ['ScoreCarDelegate']
        );
    });

    it('extracts a Java class name with modifiers', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractDeclaredClassNames('public final class ScoreCarDelegate implements JavaDelegate {')),
            ['ScoreCarDelegate']
        );
    });

    it('tolerates annotations and modifiers before the class', () => {
        const content = `
@Component
@Service("bean")
open class FooDelegate
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractDeclaredClassNames(content)),
            ['FooDelegate']
        );
    });

    it('matches Kotlin-specific declaration forms (data/sealed/enum class)', () => {
        const content = `
data class Dto(val x: Int)
sealed class Shape
enum class Status
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractDeclaredClassNames(content)),
            ['Dto', 'Shape', 'Status']
        );
    });

    it('extracts multiple declared classes', () => {
        const content = `
class Alpha
class Beta
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractDeclaredClassNames(content)),
            ['Alpha', 'Beta']
        );
    });

    it('returns an empty array when nothing is declared', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractDeclaredClassNames('val x = 1')), []);
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractDeclaredClassNames('')), []);
        assert.deepEqual(Array.from(HandlerLocator.extractDeclaredClassNames(null)), []);
    });
});

describe('HandlerLocator.extractHandlerKeys', () => {
    it('namespaces topics and declared classes', () => {
        const content = `
@ExternalTaskSubscription("explicit-topic")
class ExplicitTask
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractHandlerKeys(content)),
            ['topic:explicit-topic', 'class:ExplicitTask']
        );
    });

    it('derives both a topic key (from @WrapToExternalTask) and a class key', () => {
        const content = `
@WrapToExternalTask
class FooDelegate
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractHandlerKeys(content)),
            ['topic:fooDelegate', 'class:FooDelegate']
        );
    });

    it('returns class keys for a plain delegate with no external-task annotation', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractHandlerKeys('class ScoreCarDelegate')),
            ['class:ScoreCarDelegate']
        );
    });

    it('returns an empty array for empty content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractHandlerKeys('')), []);
    });
});

describe('HandlerLocator.simpleClassName', () => {
    it('strips the package from an FQN', () => {
        assert.equal(HandlerLocator.simpleClassName('com.foo.Bar'), 'Bar');
    });

    it('returns an already-simple name unchanged', () => {
        assert.equal(HandlerLocator.simpleClassName('Bar'), 'Bar');
    });

    it('trims surrounding whitespace', () => {
        assert.equal(HandlerLocator.simpleClassName('  com.foo.Bar  '), 'Bar');
    });

    it('returns null for empty or null', () => {
        assert.equal(HandlerLocator.simpleClassName(''), null);
        assert.equal(HandlerLocator.simpleClassName(null), null);
    });
});

describe('HandlerLocator.classKeyFromClassName', () => {
    it('builds a class key from an FQN', () => {
        assert.equal(HandlerLocator.classKeyFromClassName('com.foo.Bar'), 'class:Bar');
    });

    it('builds a class key from a simple name', () => {
        assert.equal(HandlerLocator.classKeyFromClassName('Bar'), 'class:Bar');
    });

    it('returns null for empty or null', () => {
        assert.equal(HandlerLocator.classKeyFromClassName(''), null);
        assert.equal(HandlerLocator.classKeyFromClassName(null), null);
    });
});

describe('HandlerLocator.classKeyFromDelegateExpression', () => {
    it('resolves ${bean} to a capitalised class key', () => {
        assert.equal(HandlerLocator.classKeyFromDelegateExpression('${scoreCarDelegate}'), 'class:ScoreCarDelegate');
    });

    it('supports the #{bean} form and surrounding whitespace', () => {
        assert.equal(HandlerLocator.classKeyFromDelegateExpression('  #{ fooBar } '), 'class:FooBar');
    });

    it('returns null for a dotted or method expression', () => {
        assert.equal(HandlerLocator.classKeyFromDelegateExpression('${beans.fooBar}'), null);
        assert.equal(HandlerLocator.classKeyFromDelegateExpression('${service.run()}'), null);
    });

    it('returns null for empty or null', () => {
        assert.equal(HandlerLocator.classKeyFromDelegateExpression(''), null);
        assert.equal(HandlerLocator.classKeyFromDelegateExpression(null), null);
    });
});

describe('HandlerLocator.handlerKeyFromBusinessObject', () => {
    // Minimal moddle-like BO: get(name) reads camunda attributes; `type`/`topic`
    // are plain properties (as camunda-moddle defines the external-task fields).
    function bo({ attrs = {}, type, topic, eventDefinitions } = {}) {
        return {
            type,
            topic,
            eventDefinitions,
            get: (name) => attrs[name]
        };
    }

    function msgDef(opts) {
        const def = bo(opts);
        def.$type = 'bpmn:MessageEventDefinition';
        return def;
    }

    function timerDef() {
        const def = bo({});
        def.$type = 'bpmn:TimerEventDefinition';
        return def;
    }

    it('returns a class key for a service task with camunda:class (regression)', () => {
        assert.equal(
            HandlerLocator.handlerKeyFromBusinessObject(bo({ attrs: { 'camunda:class': 'com.foo.ScoreCarDelegate' } })),
            'class:ScoreCarDelegate'
        );
    });

    it('returns a topic key for an external service task (regression)', () => {
        assert.equal(
            HandlerLocator.handlerKeyFromBusinessObject(bo({ type: 'external', topic: 'score-car' })),
            'topic:score-car'
        );
    });

    it('returns a class key from a delegateExpression on a service task (regression)', () => {
        assert.equal(
            HandlerLocator.handlerKeyFromBusinessObject(bo({ attrs: { 'camunda:delegateExpression': '${scoreCarDelegate}' } })),
            'class:ScoreCarDelegate'
        );
    });

    it('reads camunda:class from a nested messageEventDefinition (message end event)', () => {
        const event = bo({ eventDefinitions: [msgDef({ attrs: { 'camunda:class': 'com.foo.NotifyDelegate' } })] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), 'class:NotifyDelegate');
    });

    it('reads a delegateExpression from a nested messageEventDefinition', () => {
        const event = bo({ eventDefinitions: [msgDef({ attrs: { 'camunda:delegateExpression': '${notifyBean}' } })] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), 'class:NotifyBean');
    });

    it('reads external type/topic from a nested messageEventDefinition', () => {
        const event = bo({ eventDefinitions: [msgDef({ type: 'external', topic: 'notify-topic' })] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), 'topic:notify-topic');
    });

    it('picks the messageEventDefinition among several event definitions', () => {
        const event = bo({ eventDefinitions: [timerDef(), msgDef({ attrs: { 'camunda:class': 'Notify' } })] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), 'class:Notify');
    });

    it('returns null for a message event with no implementation', () => {
        const event = bo({ eventDefinitions: [msgDef({})] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), null);
    });

    it('returns null for a non-message event definition (timer/signal)', () => {
        const event = bo({ eventDefinitions: [timerDef()] });
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(event), null);
    });

    it('returns null for an element without eventDefinitions or implementation', () => {
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(bo({})), null);
    });

    it('returns null for a missing business object', () => {
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(null), null);
        assert.equal(HandlerLocator.handlerKeyFromBusinessObject(undefined), null);
    });
});

describe('HandlerLocator.termFromKey', () => {
    it('returns the topic of a topic key', () => {
        assert.equal(HandlerLocator.termFromKey('topic:my-topic'), 'my-topic');
    });

    it('returns the class name of a class key', () => {
        assert.equal(HandlerLocator.termFromKey('class:Bar'), 'Bar');
    });

    it('returns the input unchanged when there is no prefix', () => {
        assert.equal(HandlerLocator.termFromKey('bare'), 'bare');
    });
});

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { HandlerLocator, GitLabPlatformClient } = createScope();

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

describe('HandlerLocator.extractExternalTaskBeanTopics', () => {
    it('derives the topic from the class name with a lower-cased first letter', () => {
        const content = `
@Component
@ExternalTaskBean(retriesTimeout = DEFAULT_RETRIES_TIMEOUT)
class CorrectItemABTestDelegate(
    private val abTestsAccessor: AbTestsAccessor,
) : AbstractDelegate() {
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics(content)),
            ['correctItemABTestDelegate']
        );
    });

    it('supports the annotation without arguments', () => {
        const content = `
@ExternalTaskBean
class FooBarDelegate : AbstractDelegate()
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics(content)),
            ['fooBarDelegate']
        );
    });

    it('tolerates modifiers and other annotations before the class', () => {
        const content = `
@ExternalTaskBean
@Component
open class FooDelegate
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics(content)),
            ['fooDelegate']
        );
    });

    it('matches the annotation without a leading @ (e.g. inside a search snippet)', () => {
        const content = 'ExternalTaskBean\nclass SnippetDelegate';
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics(content)),
            ['snippetDelegate']
        );
    });

    it('extracts multiple wrapped handlers from one file', () => {
        const content = `
@ExternalTaskBean
class AlphaDelegate
@ExternalTaskBean(retriesTimeout = X)
class BetaDelegate
`;
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics(content)),
            ['alphaDelegate', 'betaDelegate']
        );
    });

    it('returns an empty array when there is no @ExternalTaskBean', () => {
        assert.deepEqual(
            Array.from(HandlerLocator.extractExternalTaskBeanTopics('class Plain')),
            []
        );
    });

    it('returns an empty array for empty or null content', () => {
        assert.deepEqual(Array.from(HandlerLocator.extractExternalTaskBeanTopics('')), []);
        assert.deepEqual(Array.from(HandlerLocator.extractExternalTaskBeanTopics(null)), []);
    });
});

describe('HandlerLocator.extractHandlerTopics', () => {
    it('combines @ExternalTaskSubscription and @ExternalTaskBean topics', () => {
        const content = `
@ExternalTaskSubscription("explicit-topic")
class ExplicitTask
@ExternalTaskBean
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

// extractHandlerFileChanges now operates on the normalised PlatformClient
// `prChangedFiles` shape ({ path, oldPath, status }); the GitLab response→
// normalised parsing (new_file/deleted_file/renamed) is tested in
// gitlab-platform-client.test.js.
describe('HandlerLocator.extractHandlerFileChanges', () => {
    it('keeps an added handler file, scanned at its own path', () => {
        const changed = [{ path: 'src/NewTask.kt', oldPath: 'src/NewTask.kt', status: 'added' }];
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(changed))),
            [{ filePath: 'src/NewTask.kt', scanPath: 'src/NewTask.kt', diffType: 'added' }]
        );
    });

    it('keeps a changed handler file', () => {
        const changed = [{ path: 'src/ScoreCarTask.kt', oldPath: 'src/ScoreCarTask.kt', status: 'changed' }];
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(changed))),
            [{ filePath: 'src/ScoreCarTask.kt', scanPath: 'src/ScoreCarTask.kt', diffType: 'changed' }]
        );
    });

    it('uses the (post-rename) path for a renamed handler file', () => {
        const changed = [{ path: 'src/NewName.kt', oldPath: 'src/OldName.kt', status: 'changed' }];
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(changed))),
            [{ filePath: 'src/NewName.kt', scanPath: 'src/NewName.kt', diffType: 'changed' }]
        );
    });

    it('keeps a removed handler file', () => {
        const changed = [{ path: 'src/Gone.kt', oldPath: 'src/Gone.kt', status: 'removed' }];
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(changed))),
            [{ filePath: 'src/Gone.kt', scanPath: 'src/Gone.kt', diffType: 'removed' }]
        );
    });

    it('ignores non-handler files', () => {
        const changed = [
            { path: 'src/Flow.bpmn', oldPath: 'src/Flow.bpmn', status: 'changed' },
            { path: 'README.md', oldPath: 'README.md', status: 'added' },
            { path: 'src/Task.kt', oldPath: 'src/Task.kt', status: 'changed' }
        ];
        assert.deepEqual(
            JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(changed))),
            [{ filePath: 'src/Task.kt', scanPath: 'src/Task.kt', diffType: 'changed' }]
        );
    });

    it('returns empty for an empty or missing change set', () => {
        assert.deepEqual(JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges([]))), []);
        assert.deepEqual(JSON.parse(JSON.stringify(HandlerLocator.extractHandlerFileChanges(null))), []);
    });
});

describe('HandlerLocator URL builders', () => {
    const locator = new HandlerLocator(new GitLabPlatformClient({
        projectUrl: 'https://gitlab.example/group/proj',
        hostUrl: 'https://gitlab.example',
        projectId: 42
    }));

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

    it('derives both a topic key (from @ExternalTaskBean) and a class key', () => {
        const content = `
@ExternalTaskBean
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

describe('HandlerLocator.matchesExactClassName (BUG-0027)', () => {
    it('matches an exact class name declaration', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('class FindItems {', 'FindItems'),
            true
        );
    });

    it('matches a class name followed by a colon (Kotlin inheritance)', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('class FindItems : BaseClass()', 'FindItems'),
            true
        );
    });

    it('matches a class name with generics', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('class FindItems<T> {', 'FindItems'),
            true
        );
    });

    it('does NOT match a longer class name that contains the search name as a prefix', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('class FindItemsInCatalog : BaseClass()', 'FindItems'),
            false
        );
    });

    it('does NOT match when the search name is a prefix in the snippet', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('class FindItemsExtended {', 'FindItems'),
            false
        );
    });

    it('matches the class name even with modifiers', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('open class ScoreCarDelegate : AbstractDelegate()', 'ScoreCarDelegate'),
            true
        );
    });

    it('matches the class name with annotations on the same line', () => {
        assert.equal(
            HandlerLocator.matchesExactClassName('@Component class MyHandler {', 'MyHandler'),
            true
        );
    });
});

describe('HandlerLocator.matchesExactTopic (BUG-0027)', () => {
    it('matches an exact topic in double quotes', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic('@ExternalTaskSubscription("Order_PrepareItem_FindItems")', 'Order_PrepareItem_FindItems'),
            true
        );
    });

    it('matches an exact topic in single quotes', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic("@ExternalTaskSubscription('my-topic')", 'my-topic'),
            true
        );
    });

    it('does NOT match when closing quote is missing (longer topic)', () => {
        // The regex requires matching quotes - "Order_PrepareItem_FindItems"
        // should NOT match inside "Order_PrepareItem_FindItemsInCatalog"
        assert.equal(
            HandlerLocator.matchesExactTopic('@ExternalTaskSubscription("Order_PrepareItem_FindItemsInCatalog")', 'Order_PrepareItem_FindItems'),
            false
        );
    });

    it('does NOT match when the topic is a prefix in a longer quoted string', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic('"Order_PrepareItem_FindItemsExtended"', 'Order_PrepareItem_FindItems'),
            false
        );
    });

    it('matches a topic without quotes (bare search result) using word boundaries', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic('Order_PrepareItem_FindItems', 'Order_PrepareItem_FindItems'),
            true
        );
    });

    it('does NOT match topic prefix without quotes (word boundary check)', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic('Order_PrepareItem_FindItemsInCatalog', 'Order_PrepareItem_FindItems'),
            false
        );
    });

    it('matches topic in the middle of a line with quotes', () => {
        assert.equal(
            HandlerLocator.matchesExactTopic('  @ExternalTaskSubscription("MyTopic")  ', 'MyTopic'),
            true
        );
    });
});

// Integration test using real GitLab search API response data (BUG-0027)
describe('HandlerLocator with real GitLab search results (BUG-0027)', () => {
    // Mock GitLab search API response from:
    // https://gitlab.example.com/api/v4/projects/118208/search?scope=blobs&ref=master&search=Order_PrepareItem_FindItems
    const gitLabSearchResponse = [
        {
            basename: 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask',
            data: 'import com.example.bpm.featuretoggle.json.IDENTITY_PARAM\n\n@Component("Order_PrepareItem_FindItemsInCatalog")\n@ExternalTaskSubscription("Order_PrepareItem_FindItemsInCatalog")\n@OptionExecutionAnnotation(\n    points = [\n',
            snippet: 'import com.example.bpm.featuretoggle.json.IDENTITY_PARAM\n\n@Component("Order_PrepareItem_FindItemsInCatalog")\n@ExternalTaskSubscription("Order_PrepareItem_FindItemsInCatalog")\n@OptionExecutionAnnotation(\n    points = [\n',
            path: 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt',
            filename: 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt',
            id: null,
            ref: 'master',
            startline: 21,
            project_id: 118208
        },
        {
            basename: 'order/item/src/main/kotlin/prepare/FindItemsTask',
            data: 'import com.example.bpm.camunda.externaltask.BaseExternalTaskHandler\n\n@Component("Order_PrepareItem_FindItems")\n@ExternalTaskSubscription("Order_PrepareItem_FindItems")\n@OptionExecutionAnnotation(\n    points = [\n',
            snippet: 'import com.example.bpm.camunda.externaltask.BaseExternalTaskHandler\n\n@Component("Order_PrepareItem_FindItems")\n@ExternalTaskSubscription("Order_PrepareItem_FindItems")\n@OptionExecutionAnnotation(\n    points = [\n',
            path: 'order/item/src/main/kotlin/prepare/FindItemsTask.kt',
            filename: 'order/item/src/main/kotlin/prepare/FindItemsTask.kt',
            id: null,
            ref: 'master',
            startline: 15,
            project_id: 118208
        },
        {
            basename: 'order/item/src/main/kotlin/prepare/util/OrderExtensions',
            data: '/*\n    Field format is not settled yet; more fields may need to be added here\n    All the item data is fetched here --> Order_PrepareItem_FindItems\n */\nfun OrderItem.toDescription(): String = "${make!!} ${model!!} ${maskedRegNumber() ?: Strings.EMPTY}".trim()',
            snippet: '/*\n    Field format is not settled yet; more fields may need to be added here\n    All the item data is fetched here --> Order_PrepareItem_FindItems\n */\nfun OrderItem.toDescription(): String = "${make!!} ${model!!} ${maskedRegNumber() ?: Strings.EMPTY}".trim()',
            path: 'order/item/src/main/kotlin/prepare/util/OrderExtensions.kt',
            filename: 'order/item/src/main/kotlin/prepare/util/OrderExtensions.kt',
            id: null,
            ref: 'master',
            startline: 20,
            project_id: 118208
        },
        {
            basename: 'order/item/src/main/resources/bpmn/prepare/PrepareItem',
            data: '      <bpmn:outgoing>Flow_0wfvycs</bpmn:outgoing>\n    </bpmn:exclusiveGateway>\n    <bpmn:serviceTask id="FindItemsInCatalog" name="Find customer items&#10;in Catalog" camunda:asyncBefore="true" camunda:type="external" camunda:topic="Order_PrepareItem_FindItemsInCatalog">\n      <bpmn:incoming>Flow_0wfvycs</bpmn:incoming>\n      <bpmn:outgoing>Flow_08g2xog</bpmn:outgoing>\n',
            snippet: '      <bpmn:outgoing>Flow_0wfvycs</bpmn:outgoing>\n    </bpmn:exclusiveGateway>\n    <bpmn:serviceTask id="FindItemsInCatalog" name="Find customer items&#10;in Catalog" camunda:asyncBefore="true" camunda:type="external" camunda:topic="Order_PrepareItem_FindItemsInCatalog">\n      <bpmn:incoming>Flow_0wfvycs</bpmn:incoming>\n      <bpmn:outgoing>Flow_08g2xog</bpmn:outgoing>\n',
            path: 'order/item/src/main/resources/bpmn/prepare/PrepareItem.bpmn',
            filename: 'order/item/src/main/resources/bpmn/prepare/PrepareItem.bpmn',
            id: null,
            ref: 'master',
            startline: 63,
            project_id: 118208
        },
        {
            basename: 'order/item/src/main/resources/bpmn/prepare/PrepareItem',
            data: '      <bpmn:outgoing>Flow_0ad6l98</bpmn:outgoing>\n    </bpmn:exclusiveGateway>\n    <bpmn:serviceTask id="FindItems" name="Find customer items&#10;in Registry" camunda:asyncBefore="true" camunda:type="external" camunda:topic="Order_PrepareItem_FindItems">\n      <bpmn:incoming>Flow_0aop5ck</bpmn:incoming>\n      <bpmn:outgoing>Flow_0gqm865</bpmn:outgoing>\n',
            snippet: '      <bpmn:outgoing>Flow_0ad6l98</bpmn:outgoing>\n    </bpmn:exclusiveGateway>\n    <bpmn:serviceTask id="FindItems" name="Find customer items&#10;in Registry" camunda:asyncBefore="true" camunda:type="external" camunda:topic="Order_PrepareItem_FindItems">\n      <bpmn:incoming>Flow_0aop5ck</bpmn:incoming>\n      <bpmn:outgoing>Flow_0gqm865</bpmn:outgoing>\n',
            path: 'order/item/src/main/resources/bpmn/prepare/PrepareItem.bpmn',
            filename: 'order/item/src/main/resources/bpmn/prepare/PrepareItem.bpmn',
            id: null,
            ref: 'master',
            startline: 80,
            project_id: 118208
        }
    ];

    it('finds the correct handler file for Order_PrepareItem_FindItems', () => {
        const topic = 'Order_PrepareItem_FindItems';
        const expectedHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsTask.kt';

        // Simulate the search results filtering that happens in #searchSubscriptionLocation
        const handlerItems = gitLabSearchResponse.filter(i =>
            i.path && HandlerLocator.isHandlerFile(i.path)
        );

        // Find the exact match using matchesExactTopic
        const exactMatch = handlerItems.find(i =>
            i.data && HandlerLocator.matchesExactTopic(i.data, topic)
        );

        assert.ok(exactMatch, 'Should find an exact match for the topic');
        assert.equal(exactMatch.path, expectedHandlerPath,
            `Should find ${expectedHandlerPath}, but found ${exactMatch.path}`);
    });

    it('does NOT match FindItemsInCatalogTask for the shorter topic', () => {
        const topic = 'Order_PrepareItem_FindItems';
        const wrongHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt';

        const inCatalogItem = gitLabSearchResponse.find(i =>
            i.path === wrongHandlerPath
        );

        assert.ok(inCatalogItem, 'Test setup: should have the InCatalog file');

        // This should return false because the topic in that file is longer
        const matches = HandlerLocator.matchesExactTopic(
            inCatalogItem.data,
            topic
        );

        assert.equal(matches, false,
            'Should NOT match FindItemsInCatalogTask for the shorter topic');
    });

    it('correctly identifies the InCatalog handler for its full topic', () => {
        const topic = 'Order_PrepareItem_FindItemsInCatalog';
        const expectedHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt';

        const handlerItems = gitLabSearchResponse.filter(i =>
            i.path && HandlerLocator.isHandlerFile(i.path)
        );

        const exactMatch = handlerItems.find(i =>
            i.data && HandlerLocator.matchesExactTopic(i.data, topic)
        );

        assert.ok(exactMatch, 'Should find an exact match for the InCatalog topic');
        assert.equal(exactMatch.path, expectedHandlerPath,
            `Should find ${expectedHandlerPath}, but found ${exactMatch.path}`);
    });

    it('filters out files without @ExternalTaskSubscription (OrderExtensions.kt)', () => {
        const extensionsItem = gitLabSearchResponse.find(i =>
            i.path === 'order/item/src/main/kotlin/prepare/util/OrderExtensions.kt'
        );

        assert.ok(extensionsItem, 'Test setup: should have the OrderExtensions file');

        // OrderExtensions.kt mentions the topic in a comment, but doesn't declare @ExternalTaskSubscription
        const hasSubscription = extensionsItem.data.includes('@ExternalTaskSubscription');
        assert.equal(hasSubscription, false, 'OrderExtensions.kt should not contain @ExternalTaskSubscription');

        // matchesExactTopic should still find the topic in the comment (it's a bare mention)
        // but this file would be filtered out by searching for the annotation first
        const topic = 'Order_PrepareItem_FindItems';
        const matchesTopic = HandlerLocator.matchesExactTopic(extensionsItem.data, topic);
        assert.ok(matchesTopic, 'Topic is mentioned in comment (bare match)');
    });

    it('filters out BPMN files from handler search results', () => {
        const bpmnItems = gitLabSearchResponse.filter(i =>
            i.path && i.path.endsWith('.bpmn')
        );

        assert.equal(bpmnItems.length, 2, 'Should have 2 BPMN files in search results');

        // BPMN files should not be recognized as handler files
        for (const item of bpmnItems) {
            const isHandler = HandlerLocator.isHandlerFile(item.path);
            assert.equal(isHandler, false, `${item.path} should not be recognized as a handler file`);
        }
    });

    // BUG-0027 regression test: verifies that when multiple annotated handler files
    // are returned, the one with the EXACT topic match is selected, not just the first.
    // Previously, the code used .find() which returned the first annotated file
    // (FindItemsInCatalogTask.kt), not the correct one (FindItemsTask.kt).
    it('selects the correct handler when multiple annotated files exist (BUG-0027 regression)', () => {
        const topic = 'Order_PrepareItem_FindItems';
        const expectedHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsTask.kt';
        const wrongHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt';

        // Simulate the exact logic from #searchSubscriptionLocation
        const handlerItems = gitLabSearchResponse.filter(i =>
            i.path && HandlerLocator.isHandlerFile(i.path)
        );

        // Filter to ALL annotated items (not just the first one with .find())
        const annotatedItems = handlerItems.filter(i =>
            i.snippet && i.snippet.includes('ExternalTaskSubscription')
        );

        // This is the critical fix: annotatedItems should contain BOTH files
        assert.equal(annotatedItems.length, 2,
            'Should have 2 annotated handler files (FindItemsTask and FindItemsInCatalogTask)');

        // Among the candidates, find the exact match
        const candidates = annotatedItems.length > 0 ? annotatedItems : handlerItems;
        const exactMatch = candidates.find(i =>
            i.snippet && HandlerLocator.matchesExactTopic(i.snippet, topic)
        );

        // The exact match should be FindItemsTask.kt, NOT FindItemsInCatalogTask.kt
        assert.ok(exactMatch, 'Should find an exact match');
        assert.equal(exactMatch.path, expectedHandlerPath,
            `Should select ${expectedHandlerPath}, not ${wrongHandlerPath}`);

        // Verify the first annotated item would have been WRONG (this is the bug we fixed)
        const firstAnnotated = annotatedItems[0];
        assert.notEqual(firstAnnotated.path, expectedHandlerPath,
            'Sanity check: the first annotated item should NOT be the correct one (otherwise this test is meaningless)');
    });

    // BUG-0027 regression test for class name search: verifies that when multiple
    // handler files with @ExternalTaskBean annotation exist, the one with the
    // EXACT class name match is selected, not just the first.
    it('selects the correct handler when multiple @ExternalTaskBean classes exist (BUG-0027 regression)', () => {
        const className = 'FindItems';
        const expectedHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsTask.kt';
        const wrongHandlerPath = 'order/item/src/main/kotlin/prepare/FindItemsInCatalogTask.kt';

        // Create mock search results for "class FindItems" search
        // Simulating GitLab API response with class name matches
        // Note: The search term "class FindItems" returns BOTH files because
        // GitLab search does prefix matching. The exact match logic must filter correctly.
        const classSearchResponse = [
            {
                path: wrongHandlerPath,
                snippet: '@Component("Order_PrepareItem_FindItemsInCatalog")\n@ExternalTaskBean\nclass FindItemsInCatalogTask : BaseExternalTaskHandler()',
                filename: wrongHandlerPath
            },
            {
                path: expectedHandlerPath,
                snippet: '@Component("Order_PrepareItem_FindItems")\n@ExternalTaskBean\nclass FindItems : BaseExternalTaskHandler()',
                filename: expectedHandlerPath
            }
        ];

        // Simulate the exact logic from #searchClassLocation
        const handlerItems = classSearchResponse.filter(i =>
            i.path && HandlerLocator.isHandlerFile(i.path)
        );

        // Filter to ALL items with @ExternalTaskBean annotation (not just the first)
        const preferredItems = handlerItems.filter(i =>
            i.snippet && i.snippet.includes('@ExternalTaskBean')
        );

        // Both files should have the annotation
        assert.equal(preferredItems.length, 2,
            'Should have 2 handler files with @ExternalTaskBean annotation');

        // Among the candidates, find the exact class name match
        const candidates = preferredItems.length > 0 ? preferredItems : handlerItems;
        const exactMatch = candidates.find(i =>
            i.snippet && HandlerLocator.matchesExactClassName(i.snippet, className)
        );

        // The exact match should be FindItemsTask.kt (which declares "class FindItems"),
        // NOT FindItemsInCatalogTask.kt (which declares "class FindItemsInCatalogTask")
        assert.ok(exactMatch, 'Should find an exact match for the class name');
        assert.equal(exactMatch.path, expectedHandlerPath,
            `Should select ${expectedHandlerPath}, not ${wrongHandlerPath}`);

        // Verify the first preferred item would have been WRONG
        const firstPreferred = preferredItems[0];
        assert.notEqual(firstPreferred.path, expectedHandlerPath,
            'Sanity check: the first preferred item should NOT be the correct one');
    });
});

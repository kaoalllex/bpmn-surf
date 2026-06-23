'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { CorrelationLocator } = createScope();

// Objects/arrays returned from the vm realm carry that realm's prototypes, so
// assert.deepEqual fails reference-equality on them — convert to plain host
// values first (see test/support/scope.js).
const plain = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

// --- moddle business-object mocks ---------------------------------------------

function receiveTask(name) {
    return { $type: 'bpmn:ReceiveTask', messageRef: name == null ? null : { name } };
}

function messageEvent(type, name) {
    return {
        $type: type,
        eventDefinitions: [
            { $type: 'bpmn:MessageEventDefinition', messageRef: name == null ? null : { name } }
        ]
    };
}

// --- a fake searchFn over a term -> items table -------------------------------

function searcher(table) {
    return async (term) => table[term] || [];
}

describe('CorrelationLocator.extractMessageName', () => {
    it('reads the name from a ReceiveTask messageRef', () => {
        assert.deepEqual(
            plain(CorrelationLocator.extractMessageName(receiveTask('OrderPlaced'))),
            { name: 'OrderPlaced', dynamic: false }
        );
    });

    it('reads the name from an intermediate message catch event', () => {
        assert.deepEqual(
            plain(CorrelationLocator.extractMessageName(messageEvent('bpmn:IntermediateCatchEvent', 'PaymentDone'))),
            { name: 'PaymentDone', dynamic: false }
        );
    });

    it('reads the name from a message start event', () => {
        assert.deepEqual(
            plain(CorrelationLocator.extractMessageName(messageEvent('bpmn:StartEvent', 'OrderReceived'))),
            { name: 'OrderReceived', dynamic: false }
        );
    });

    it('reads the name from a message boundary event', () => {
        assert.deepEqual(
            plain(CorrelationLocator.extractMessageName(messageEvent('bpmn:BoundaryEvent', 'Cancelled'))),
            { name: 'Cancelled', dynamic: false }
        );
    });

    it('returns null for an element that does not wait for a message', () => {
        assert.equal(CorrelationLocator.extractMessageName({ $type: 'bpmn:Task' }), null);
        assert.equal(CorrelationLocator.extractMessageName(receiveTask(null)), null);
    });

    it('returns null for a message THROW event (it sends, it does not wait)', () => {
        assert.equal(
            plain(CorrelationLocator.extractMessageName(messageEvent('bpmn:IntermediateThrowEvent', 'Sent'))),
            null
        );
        assert.equal(
            plain(CorrelationLocator.extractMessageName(messageEvent('bpmn:EndEvent', 'Sent'))),
            null
        );
    });

    it('returns null for a non-message catch event (e.g. timer)', () => {
        const timer = {
            $type: 'bpmn:IntermediateCatchEvent',
            eventDefinitions: [{ $type: 'bpmn:TimerEventDefinition' }]
        };
        assert.equal(CorrelationLocator.extractMessageName(timer), null);
    });

    it('flags a name with an embedded expression as dynamic', () => {
        assert.deepEqual(
            plain(CorrelationLocator.extractMessageName(receiveTask('Order_${orderId}'))),
            { name: 'Order_${orderId}', dynamic: true }
        );
    });

    it('returns null for a null business object', () => {
        assert.equal(CorrelationLocator.extractMessageName(null), null);
    });
});

describe('CorrelationLocator.isDynamicName', () => {
    it('detects an embedded expression', () => {
        assert.equal(CorrelationLocator.isDynamicName('a_${x}'), true);
    });
    it('treats a plain name as static', () => {
        assert.equal(CorrelationLocator.isDynamicName('OrderPlaced'), false);
    });
});

describe('CorrelationLocator.classifyHit', () => {
    it('marks a line with a Camunda 7 correlation keyword as a correlation point', () => {
        const hit = { path: 'src/Listener.kt', snippet: 'runtimeService.correlateMessage("OrderPlaced")' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'correlation');
    });

    it('marks a line with a Zeebe publish keyword as a correlation point', () => {
        const hit = { path: 'src/Pub.java', snippet: 'client.newPublishMessageCommand().messageName("OrderPlaced")' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'correlation');
    });

    it('captures the constant name from a Java constant declaration', () => {
        const hit = { path: 'src/Messages.java', snippet: 'static final String ORDER_PLACED = "OrderPlaced";' };
        assert.deepEqual(
            plain(CorrelationLocator.classifyHit(hit, 'OrderPlaced')),
            { category: 'constant', constantName: 'ORDER_PLACED' }
        );
    });

    it('captures the constant name from a Kotlin const val declaration', () => {
        const hit = { path: 'src/Messages.kt', snippet: 'const val ORDER_PLACED = "OrderPlaced"' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').constantName, 'ORDER_PLACED');
    });

    it('excludes the .bpmn file (the receiving side)', () => {
        const hit = { path: 'diagrams/order.bpmn', snippet: '<message name="OrderPlaced" />' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'diagram');
    });

    it('excludes a .dmn file', () => {
        const hit = { path: 'diagrams/order.dmn', snippet: 'OrderPlaced' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'diagram');
    });

    it('marks a .yml file as config', () => {
        const hit = { path: 'src/main/resources/application.yml', snippet: 'message: OrderPlaced' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'config');
    });

    it('marks a .properties file as config', () => {
        const hit = { path: 'app.properties', snippet: 'msg=OrderPlaced' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'config');
    });

    it('classifies a plain literal occurrence as other', () => {
        const hit = { path: 'src/Notes.kt', snippet: 'val doc = "see OrderPlaced flow"' };
        assert.equal(CorrelationLocator.classifyHit(hit, 'OrderPlaced').category, 'other');
    });
});

describe('CorrelationLocator.collectHits — exact-term gate', () => {
    it('drops a hit whose snippet does not contain the searched term (GitLab fuzzy match)', () => {
        // GitLab tokenised FINISH_VERIFICATION_API and returned a handler that
        // correlates a DIFFERENT message; its snippet lacks the exact name.
        const items = [
            { path: 'business/car/.../CarPreOfferScreenMessageHandler.kt',
                snippet: 'correlateMessage(SCREEN_CHANGED)', line: 23 }
        ];
        assert.equal(CorrelationLocator.collectHits(items, 'FINISH_VERIFICATION_API').length, 0);
    });

    it('keeps a hit whose snippet contains the exact term', () => {
        const items = [
            { path: 'business/module/.../VerificationStopUseCase.kt',
                snippet: 'createMessageCorrelation(FINISH_VERIFICATION_API)', line: 30 }
        ];
        assert.equal(CorrelationLocator.collectHits(items, 'FINISH_VERIFICATION_API').length, 1);
    });

    it('drops an item that has no snippet at all', () => {
        assert.equal(CorrelationLocator.collectHits([{ path: 'a/B.kt' }], 'X').length, 0);
    });
});

describe('CorrelationLocator.isTestPath', () => {
    it('detects a test directory', () => {
        assert.equal(CorrelationLocator.isTestPath('src/test/kotlin/Foo.kt'), true);
    });
    it('detects an autotests directory', () => {
        assert.equal(CorrelationLocator.isTestPath('autotests/tests/car/Car_Activation.spec.ts'), true);
    });
    it('detects a *Test JVM class', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/FooTest.kt'), true);
    });
    it('detects a *Spec JVM class', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/FooSpec.kt'), true);
    });
    it('detects an integration-test *IT class', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/OrderServiceIT.java'), true);
    });
    it('detects a lowercase .spec.ts file outside a test directory', () => {
        assert.equal(CorrelationLocator.isTestPath('src/Car_Activation.spec.ts'), true);
    });
    it('detects a .test.tsx file', () => {
        assert.equal(CorrelationLocator.isTestPath('ui/Button.test.tsx'), true);
    });
    it('treats a production file as non-test', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/FooListener.kt'), false);
    });
    it('does not mistake a name merely ending in lower-case "test"/"it" for a test', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/Latest.kt'), false);
        assert.equal(CorrelationLocator.isTestPath('src/main/Audit.kt'), false);
    });
    it('does not mistake the Italian i18n directory for tests', () => {
        assert.equal(CorrelationLocator.isTestPath('src/main/resources/messages/it/app.properties'), false);
    });
});

describe('CorrelationLocator.rankHits', () => {
    it('orders correlation > other > constant > config and de-duplicates by path:line', () => {
        const make = (category, path) => CorrelationLocator.collectHits(
            [{ path, snippet: dataFor(category), line: 1 }],
            'OrderPlaced'
        )[0];
        const ranked = CorrelationLocator.rankHits([
            make('config', 'a.yml'),
            make('other', 'b.kt'),
            make('correlation', 'c.kt'),
            make('constant', 'd.kt')
        ]);
        assert.deepEqual(Array.from(ranked).map(h => h.category), ['correlation', 'other', 'constant', 'config']);
    });

    it('boosts a handler-like file name above a plain correlation hit', () => {
        const plain = CorrelationLocator.collectHits(
            [{ path: 'src/main/Service.kt', snippet: 'correlateMessage("OrderPlaced")', line: 1 }], 'OrderPlaced')[0];
        const listener = CorrelationLocator.collectHits(
            [{ path: 'src/main/OrderListener.kt', snippet: 'correlateMessage("OrderPlaced")', line: 1 }], 'OrderPlaced')[0];
        const ranked = CorrelationLocator.rankHits([plain, listener]);
        assert.equal(ranked[0].path, 'src/main/OrderListener.kt');
    });

    it('de-duplicates the same path and line', () => {
        const a = { path: 'x.kt', line: 5, category: 'other', score: 40 };
        const b = { path: 'x.kt', line: 5, category: 'other', score: 40 };
        assert.equal(CorrelationLocator.rankHits([a, b]).length, 1);
    });
});

function dataFor(category) {
    switch (category) {
        case 'correlation': return 'correlateMessage("OrderPlaced")';
        case 'constant': return 'const val ORDER_PLACED = "OrderPlaced"';
        case 'config': return 'message: OrderPlaced';
        default: return 'log("OrderPlaced")';
    }
}

describe('CorrelationLocator.resolveWith', () => {
    it('groups a literal correlation hit under correlation points', async () => {
        const search = searcher({
            OrderPlaced: [
                { path: 'src/OrderListener.kt', snippet: 'correlateMessage("OrderPlaced")', line: 10 }
            ]
        });
        const result = await CorrelationLocator.resolveWith('OrderPlaced', search);
        assert.equal(result.groups.correlation.length, 1);
        assert.equal(result.groups.correlation[0].path, 'src/OrderListener.kt');
        assert.equal(result.groups.correlation[0].line, 10);
    });

    it('resolves a constant to the correlation usage within its declaring file (phase 2)', async () => {
        // Phase 1: the literal is only declared as a constant, no correlation on this line.
        const search = searcher({
            OrderPlaced: [
                { path: 'src/OrderUseCase.kt', snippet: 'const val MSG = "OrderPlaced"', line: 20 }
            ]
        });
        // Phase 2 fetches the declaring file and finds where the constant correlates.
        const files = {
            'src/OrderUseCase.kt':
                'class OrderUseCase {\n' +
                '  fun run(id: String) {\n' +
                '    service.correlateMessageFor(\n' +
                '      messageName = MSG,\n' +
                '    )\n' +
                '  }\n' +
                '  companion object { const val MSG = "OrderPlaced" }\n' +
                '}\n'
        };
        const fetchFile = async (path) => files[path] || null;
        const result = await CorrelationLocator.resolveWith('OrderPlaced', search, fetchFile);
        assert.equal(result.groups.correlation.length, 1);
        assert.equal(result.groups.correlation[0].path, 'src/OrderUseCase.kt');
        assert.equal(result.groups.correlation[0].line, 4); // the `messageName = MSG` usage
        // The declaration itself stays as an "other" reference.
        assert.equal(result.groups.other.some(h => h.path === 'src/OrderUseCase.kt'), true);
    });

    it('caps phase-2 file resolution at two constants', async () => {
        const search = searcher({
            Msg: ['A', 'B', 'C'].map((c, i) => ({
                path: `Msg${c}.kt`, snippet: `const val MSG_${c} = "Msg"`, line: i + 1
            }))
        });
        const fetched = [];
        const fetchFile = async (path) => { fetched.push(path); return null; };
        await CorrelationLocator.resolveWith('Msg', search, fetchFile);
        assert.equal(fetched.length, 2); // at most two declaring files fetched
    });

    it('does NOT globally search a generic constant name (no flood of other messages)', async () => {
        // The bug: a constant named CORRELATION_MESSAGE was globally searched and
        // matched every handler correlating a DIFFERENT message. Phase 2 must only
        // fetch the declaring file, never search the constant name.
        const searched = [];
        const search = async (term) => {
            searched.push(term);
            if (term === 'FINISH_VERIFICATION_API') {
                return [{ path: 'module/VerificationStopUseCase.kt',
                    snippet: 'private const val CORRELATION_MESSAGE = "FINISH_VERIFICATION_API"', line: 40 }];
            }
            return [];
        };
        const fetchFile = async () =>
            'fun stop() {\n  service.correlateMessageFor(messageName = CORRELATION_MESSAGE)\n}\n' +
            'companion object { const val CORRELATION_MESSAGE = "FINISH_VERIFICATION_API" }\n';
        const result = await CorrelationLocator.resolveWith('FINISH_VERIFICATION_API', search, fetchFile);
        assert.deepEqual(searched, ['FINISH_VERIFICATION_API']); // only the phase-1 search ran
        assert.deepEqual(plain(result.groups.correlation.map(h => h.path)), ['module/VerificationStopUseCase.kt']);
    });

    it('degrades a dynamic name without searching', async () => {
        let searched = false;
        const search = async () => { searched = true; return []; };
        const result = await CorrelationLocator.resolveWith('Order_${id}', search);
        assert.equal(result.dynamic, true);
        assert.equal(searched, false);
        assert.equal(result.groups.correlation.length, 0);
    });

    it('returns empty groups when nothing is found', async () => {
        const result = await CorrelationLocator.resolveWith('Nope', searcher({}));
        assert.equal(result.groups.correlation.length, 0);
        assert.equal(result.groups.other.length, 0);
        assert.equal(result.groups.config.length, 0);
    });

    it('keeps only config hits when the name lives in config', async () => {
        const search = searcher({
            OrderPlaced: [
                { path: 'src/main/resources/application.yml', snippet: 'message: OrderPlaced', line: 7 }
            ]
        });
        const result = await CorrelationLocator.resolveWith('OrderPlaced', search);
        assert.equal(result.groups.correlation.length, 0);
        assert.equal(result.groups.config.length, 1);
    });

    it('segregates a correlation hit found in a test into the tests group', async () => {
        const search = searcher({
            OrderPlaced: [
                { path: 'src/main/OrderListener.kt', snippet: 'correlateMessage("OrderPlaced")', line: 14 },
                { path: 'src/test/OrderProcessTest.kt', snippet: 'correlateMessage("OrderPlaced")', line: 36 }
            ]
        });
        const result = await CorrelationLocator.resolveWith('OrderPlaced', search);
        assert.deepEqual(plain(result.groups.correlation.map(h => h.path)), ['src/main/OrderListener.kt']);
        assert.deepEqual(plain(result.groups.tests.map(h => h.path)), ['src/test/OrderProcessTest.kt']);
    });

    it('excludes GitLab fuzzy matches and keeps the genuine correlation site (FINISH_VERIFICATION_API)', async () => {
        // Reproduces the reported bug: tokenised search returns 4 unrelated
        // handlers that correlate OTHER messages, plus the real site. Only the
        // real one — whose snippet contains the exact name — must survive.
        const search = searcher({
            FINISH_VERIFICATION_API: [
                { path: 'business/car/.../AbstractCarOfferScreenMessageHandler.kt',
                    snippet: 'fun correlateMessage(screen: Screen)', line: 15 },
                { path: 'business/car/.../RequestStsScreenMessageHandler.kt',
                    snippet: 'correlateMessage(REQUEST_STS)', line: 23 },
                { path: 'business/car/.../StsRequestScreenMessageHandler.kt',
                    snippet: 'correlateMessage(STS_REQUEST)', line: 22 },
                { path: 'business/car/.../CarPreOfferScreenMessageHandler.kt',
                    snippet: 'correlateMessage(CAR_PRE_OFFER)', line: 23 },
                { path: 'business/module-verification/.../VerificationStopUseCase.kt',
                    snippet: 'runtimeService.createMessageCorrelation(FINISH_VERIFICATION_API)', line: 30 }
            ]
        });
        const result = await CorrelationLocator.resolveWith('FINISH_VERIFICATION_API', search);
        assert.deepEqual(
            plain(result.groups.correlation.map(h => h.path)),
            ['business/module-verification/.../VerificationStopUseCase.kt']
        );
    });

    it('does not fetch a declaring file for a constant only declared in a test', async () => {
        const search = searcher({
            OrderPlaced: [
                { path: 'src/test/Fixtures.kt', snippet: 'const val ORDER_PLACED = "OrderPlaced"', line: 1 }
            ]
        });
        const fetched = [];
        const fetchFile = async (path) => { fetched.push(path); return null; };
        await CorrelationLocator.resolveWith('OrderPlaced', search, fetchFile);
        assert.equal(fetched.length, 0); // the test-only constant is not chased
    });
});

describe('CorrelationLocator.findConstantCorrelationLine', () => {
    const FILE =
        'class VerificationStopUseCase {\n' +              // 1
        '  fun stop(id: String) {\n' +                     // 2
        '    service.correlateMessageFor<Ctx>(\n' +         // 3
        '      messageName = CORRELATION_MESSAGE,\n' +      // 4
        '      businessKey = id,\n' +                       // 5
        '    )\n' +                                         // 6
        '  }\n' +                                           // 7
        '  companion object {\n' +                          // 8
        '    private const val CORRELATION_MESSAGE = "FINISH_VERIFICATION_API"\n' + // 9
        '  }\n' +                                           // 10
        '}\n';                                              // 11

    it('finds the line where the constant is used to correlate', () => {
        assert.equal(CorrelationLocator.findConstantCorrelationLine(FILE, 'CORRELATION_MESSAGE'), 4);
    });

    it('returns null when the file only declares the constant (no correlation usage)', () => {
        const constantsFile = 'object Messages {\n  const val CORRELATION_MESSAGE = "FINISH_VERIFICATION_API"\n}\n';
        assert.equal(CorrelationLocator.findConstantCorrelationLine(constantsFile, 'CORRELATION_MESSAGE'), null);
    });

    it('does not match a longer constant that merely contains the name as a substring', () => {
        const other =
            'fun handle() {\n' +
            '  service.correlateMessageFor(messageName = STS_SCREEN_COMPLETED_CORRELATION_MESSAGE)\n' +
            '}\n';
        assert.equal(CorrelationLocator.findConstantCorrelationLine(other, 'CORRELATION_MESSAGE'), null);
    });

    it('returns null for empty content', () => {
        assert.equal(CorrelationLocator.findConstantCorrelationLine(null, 'X'), null);
        assert.equal(CorrelationLocator.findConstantCorrelationLine('', 'X'), null);
    });
});

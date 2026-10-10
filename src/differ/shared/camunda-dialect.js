// Which Camunda engine a diagram targets (FEAT-0038). One differ tab works in
// one dialect: camunda-bpmn-moddle and zeebe-bpmn-moddle both extend the BPMN
// types with modelerTemplate and cannot be registered together, so the differ
// picks one and every dialect-dependent decision (panel, accessors, search
// terms, handler keys) is a method of that one object. The two objects share
// one interface; neither falls back to the other: in a 7-vs-8 diff the other
// dialect's element simply reads as having nothing.

const ZEEBE_NAMESPACE_REGEX = /xmlns:[\w.-]+\s*=\s*["']http:\/\/camunda\.org\/schema\/zeebe\/1\.0["']/;
const CAMUNDA_CLOUD_PLATFORM_REGEX = /executionPlatform\s*=\s*["']Camunda Cloud["']/;

// C8 if any of the given documents is C8 (a 7-vs-8 diff shows the C8 side's
// panel); plain BPMN and missing versions read as C7, the behaviour before C8.
function detectCamundaDialect(...xmls) {
    const isC8 = (xml) => !!xml
        && (ZEEBE_NAMESPACE_REGEX.test(xml) || CAMUNDA_CLOUD_PLATFORM_REGEX.test(xml));
    return xmls.some(isC8) ? CAMUNDA_DIALECT.C8 : CAMUNDA_DIALECT.C7;
}

// A FEEL expression (`=…`) where an id is expected cannot be searched for.
function isFeelExpression(value) {
    return typeof value === 'string' && value.startsWith('=');
}

function zeebeExtension(bo, type) {
    return bo?.extensionElements?.values?.find(value => value.$type === type) ?? null;
}

// C8: the job type is the handler key (topic:<type>, the same namespace as a C7
// topic). Camunda's own connectors (io.camunda:…) have no project code, and a
// FEEL type (=…) names none.
function jobTypeKey(type) {
    if (!type || type.startsWith('io.camunda:') || isFeelExpression(type)) {
        return null;
    }
    return `topic:${type}`;
}

// C7: implementation attributes (external type+topic / camunda:delegateExpression
// / camunda:class) are defined on the camunda:ServiceTaskLike that owns them.
// Where they live depends on the element:
//  - a service / send / business-rule task carries them on the BO itself;
//  - a message event (end or intermediate-throw) carries them on its nested
//    bpmn:MessageEventDefinition, not on the event BO.
// camunda:expression is intentionally ignored (a method call, not a class —
// parity with the badge's scope). Attributes are read via get() because `class`
// is a reserved word (bo.class would not work).
function camundaImplementationKey(bo) {
    const impl = camundaImplementationHolder(bo);
    if (!impl) {
        return null;
    }
    if (impl.type === 'external' && impl.topic) {
        return `topic:${impl.topic}`;
    }
    const delegateExpression = impl.get && impl.get('camunda:delegateExpression');
    if (delegateExpression) {
        return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
    }
    const className = impl.get && impl.get('camunda:class');
    if (className) {
        return HandlerLocator.classKeyFromClassName(className);
    }
    return null;
}

// The moddle object that actually carries the implementation attributes: a
// nested bpmn:MessageEventDefinition when the BO has one (message events
// store them there), otherwise the BO itself (service/send/business-rule
// tasks store them directly). Other event-definition types (timer, signal,
// error, …) carry no class/delegate, so the BO falls through and yields null.
function camundaImplementationHolder(bo) {
    if (!bo) {
        return null;
    }
    const defs = bo.eventDefinitions || (bo.get && bo.get('eventDefinitions'));
    const msgDef = defs && defs.find(d => d.$type === 'bpmn:MessageEventDefinition');
    return msgDef || bo;
}

// C7 execution / task listeners (FEAT-0019): a class or a delegate bean names a
// handler class; an expression (a method call) or a script names none.
function camundaListenerKeys(bo) {
    return (bo?.extensionElements?.values ?? [])
        .filter(value => value.$type === 'camunda:ExecutionListener' || value.$type === 'camunda:TaskListener')
        .map(listener => ({
            key: listener.delegateExpression
                ? HandlerLocator.classKeyFromDelegateExpression(listener.delegateExpression)
                : HandlerLocator.classKeyFromClassName(listener.class),
            kind: listener.$type === 'camunda:TaskListener' ? 'task' : 'execution',
            event: listener.event
        }))
        .filter(entry => entry.key);
}

// C8 listeners are job workers: the job type is the key, as for a task.
function zeebeListenerKeys(bo) {
    return ['zeebe:ExecutionListeners', 'zeebe:TaskListeners'].flatMap(type =>
        (zeebeExtension(bo, type)?.listeners ?? []).map(listener => ({
            key: jobTypeKey(listener.type),
            kind: type === 'zeebe:TaskListeners' ? 'task' : 'execution',
            event: listener.eventType
        })))
        .filter(entry => entry.key);
}

// HandlerLocator is loaded after this file; the key methods call it at use time.
const CAMUNDA_DIALECT = Object.freeze({
    C7: Object.freeze({
        id: 'c7',
        moddleExtensions: (params) => ({ camunda: params.camundaBpmnModdle }),
        propertiesProviderModule: () => window.BpmnJSPropertiesPanel.CamundaPlatformPropertiesProviderModule,
        calledProcessId: (bo) => bo?.calledElement ?? null,
        calledDecisionId: (bo) => bo?.decisionRef ?? null,
        processCallerTerm: (id) => `calledElement="${id}"`,
        decisionCallerTerm: (id) => `decisionRef="${id}"`,
        handlerKey: (bo) => camundaImplementationKey(bo),
        // [{ key, kind: 'execution' | 'task', event }] in document order.
        listenerKeys: (bo) => camundaListenerKeys(bo),
        implementationGroup: () => 'Implementation',
        formGroup: 'Forms'
    }),
    C8: Object.freeze({
        id: 'c8',
        moddleExtensions: (params) => ({ zeebe: params.zeebeBpmnModdle }),
        propertiesProviderModule: () => window.BpmnJSPropertiesPanel.ZeebePropertiesProviderModule,
        calledProcessId: (bo) => zeebeExtension(bo, 'zeebe:CalledElement')?.processId ?? null,
        calledDecisionId: (bo) => zeebeExtension(bo, 'zeebe:CalledDecision')?.decisionId ?? null,
        processCallerTerm: (id) => `processId="${id}"`,
        decisionCallerTerm: (id) => `decisionId="${id}"`,
        // The zeebe:TaskDefinition sits in the element's own extensionElements —
        // also on a message throw / end event, not on its event definition.
        handlerKey: (bo) => jobTypeKey(zeebeExtension(bo, 'zeebe:TaskDefinition')?.type),
        listenerKeys: (bo) => zeebeListenerKeys(bo),
        // The Zeebe panel has no Implementation group on a service / send task:
        // its job type is the "Task definition".
        implementationGroup: (elementType) =>
            (elementType === 'bpmn:ServiceTask' || elementType === 'bpmn:SendTask' ? 'Task definition' : 'Implementation'),
        formGroup: 'Form'
    })
});

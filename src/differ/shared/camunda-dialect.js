// Which Camunda engine a diagram targets (FEAT-0038). One differ tab works in
// one dialect: camunda-bpmn-moddle and zeebe-bpmn-moddle both extend the BPMN
// types with modelerTemplate and cannot be registered together, so the differ
// picks one and every dialect-dependent decision (panel, accessors, search
// terms, handler keys) reads that one value.
const CAMUNDA_DIALECT = Object.freeze({ C7: 'c7', C8: 'c8' });

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

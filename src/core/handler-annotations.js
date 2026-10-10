// Which annotations mark a task handler in the project's source code (FEAT-0035):
// a Camunda 7 external-task handler or a Camunda 8 job worker (FEAT-0038). Two
// declaration styles exist, and a project may use either, both or neither:
//
//  - `topic` annotations state the topic / job type as a string argument, the way
//    stock Camunda does: @ExternalTaskSubscription("validateOrder"),
//    @JobWorker(type = "validate-order"); with no type the job type is the
//    annotated method's name (@JobWorker fun screenFraud(…) → "screenFraud");
//  - `className` annotations state nothing, and the framework derives the topic
//    from the annotated class name with a lower-cased first letter — an
//    annotated `class ReserveStockHandler` serves the topic "reserveStockHandler".
//
// Only the first style is part of Camunda itself, so it alone is on by default —
// with both stock names, so a fresh install works for Camunda 7 and 8 alike (a
// list the user already saved is kept as it is);
// no stock annotation works the second way, so that list starts empty and is
// filled per installation (popup → Handler annotations, or an imported settings
// file) by projects whose own framework needs it.
//
// This module is loaded in all three scopes (popup, content script, differ page),
// so it stays free of chrome.* and DOM.

const DEFAULT_HANDLER_ANNOTATIONS = Object.freeze({
    topic: Object.freeze(['ExternalTaskSubscription', 'JobWorker']),
    className: Object.freeze([])
});

// A Java/Kotlin annotation name; the leading @ is optional on input and never
// stored. Anything else is dropped rather than escaped, so a stored value can
// never widen the search regex built from it.
const HANDLER_ANNOTATION_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Cleans a stored / imported / wire value into { topic: string[], className: string[] }.
 * A missing list falls back to the default; an explicitly empty one stays empty,
 * because switching a style off is a legitimate choice.
 * @returns {{topic: string[], className: string[]}}
 */
function normalizeHandlerAnnotations(raw) {
    const clean = (list, fallback) => {
        if (!Array.isArray(list)) {
            return [...fallback];
        }
        const names = new Set();
        for (const entry of list) {
            const name = String(entry === null || entry === undefined ? '' : entry).trim().replace(/^@/, '');
            if (HANDLER_ANNOTATION_NAME_REGEX.test(name)) {
                names.add(name);
            }
        }
        return [...names];
    };

    const source = raw || {};
    return {
        topic: clean(source.topic, DEFAULT_HANDLER_ANNOTATIONS.topic),
        className: clean(source.className, DEFAULT_HANDLER_ANNOTATIONS.className)
    };
}

/**
 * Whether the given value differs from the shipped default — the popup uses it
 * to say whether anything is worth exporting.
 */
function isDefaultHandlerAnnotations(annotations) {
    const { topic, className } = normalizeHandlerAnnotations(annotations);
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    return same(topic, [...DEFAULT_HANDLER_ANNOTATIONS.topic])
        && same(className, [...DEFAULT_HANDLER_ANNOTATIONS.className]);
}

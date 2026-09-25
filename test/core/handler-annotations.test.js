const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createScope } = require('#scope');

const {
    DEFAULT_HANDLER_ANNOTATIONS,
    normalizeHandlerAnnotations,
    isDefaultHandlerAnnotations
} = createScope();

describe('normalizeHandlerAnnotations', () => {
    it('defaults to the stock Camunda annotation only', () => {
        assert.deepEqual(normalizeHandlerAnnotations(undefined), {
            topic: ['ExternalTaskSubscription'],
            className: []
        });
        assert.deepEqual(normalizeHandlerAnnotations(null), normalizeHandlerAnnotations({}));
    });

    it('keeps an explicitly empty list empty — switching a style off is a choice', () => {
        assert.deepEqual(normalizeHandlerAnnotations({ topic: [], className: [] }), {
            topic: [],
            className: []
        });
    });

    it('strips a leading @ and surrounding whitespace', () => {
        assert.deepEqual(
            normalizeHandlerAnnotations({ topic: ['  @ExternalTaskSubscription '] }).topic,
            ['ExternalTaskSubscription']
        );
    });

    it('drops anything that is not an annotation name, instead of escaping it', () => {
        // A stored value must never be able to widen the search regex built from it.
        const { topic } = normalizeHandlerAnnotations({
            topic: ['Good', 'has space', 'a|b', '.*', '', null, undefined, 42, '9Leading']
        });
        assert.deepEqual(topic, ['Good']);
    });

    it('de-duplicates while keeping the first occurrence order', () => {
        assert.deepEqual(
            normalizeHandlerAnnotations({ className: ['B', 'A', 'B', '@A'] }).className,
            ['B', 'A']
        );
    });

    it('accepts a number-bearing name and an underscore start', () => {
        assert.deepEqual(
            normalizeHandlerAnnotations({ className: ['_Private', 'Task2'] }).className,
            ['_Private', 'Task2']
        );
    });

    it('treats a non-array as "not configured" and falls back', () => {
        assert.deepEqual(normalizeHandlerAnnotations({ topic: 'ExternalTaskSubscription' }).topic,
            [...DEFAULT_HANDLER_ANNOTATIONS.topic]);
    });
});

describe('isDefaultHandlerAnnotations', () => {
    it('is true for the shipped default in any equivalent spelling', () => {
        assert.equal(isDefaultHandlerAnnotations(undefined), true);
        assert.equal(isDefaultHandlerAnnotations({}), true);
        assert.equal(isDefaultHandlerAnnotations({ topic: ['ExternalTaskSubscription'], className: [] }), true);
    });

    it('is false once a style is added or removed', () => {
        assert.equal(isDefaultHandlerAnnotations({ className: ['ExternalTaskBean'] }), false);
        assert.equal(isDefaultHandlerAnnotations({ topic: [], className: [] }), false);
    });
});

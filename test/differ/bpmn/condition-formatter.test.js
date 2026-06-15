'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createScope } = require('#scope');

const { ConditionFormatter } = createScope();

describe('ConditionFormatter.format', () => {
    const formatter = new ConditionFormatter();
    // Array.from converts the realm array for deepEqual (see scope.js)
    const format = condition => Array.from(formatter.format(condition));

    it('returns single line for a plain expression', () => {
        assert.deepEqual(format('x > 5'), ['x > 5']);
    });

    it('returns empty array for empty string', () => {
        assert.deepEqual(format(''), []);
    });

    it('splits && operands with indentation inside ${...}', () => {
        assert.deepEqual(format('${a && b}'), [
            '${',
            '  a &&',
            '  b',
            '}'
        ]);
    });

    it('splits || operands with indentation inside ${...}', () => {
        assert.deepEqual(format('${a || b}'), [
            '${',
            '  a ||',
            '  b',
            '}'
        ]);
    });

    it('keeps function call parentheses on one line', () => {
        assert.deepEqual(format('${contains(name, "abc") || flag}'), [
            '${',
            '  contains(name, "abc") ||',
            '  flag',
            '}'
        ]);
    });

    it('indents grouping parentheses as separate lines', () => {
        assert.deepEqual(format('${(a || b) && c}'), [
            '${',
            '  (',
            '    a ||',
            '    b',
            '  ) &&',
            '  c',
            '}'
        ]);
    });

    it('does not split on && inside string literals', () => {
        assert.deepEqual(format('${s == "y && z"}'), [
            '${',
            '  s == "y && z"',
            '}'
        ]);
    });

    it('handles escaped quote inside string literal', () => {
        assert.deepEqual(format('${s == "a\\"b" && c}'), [
            '${',
            '  s == "a\\"b" &&',
            '  c',
            '}'
        ]);
    });

    it('indents nested grouping parentheses level by level', () => {
        assert.deepEqual(format('${(a && !b) || (c && (d || e))}'), [
            '${',
            '  (',
            '    a &&',
            '    !b',
            '  ) ||',
            '  (',
            '    c &&',
            '    (',
            '      d ||',
            '      e',
            '    )',
            '  )',
            '}'
        ]);
    });

    it('keeps a function call with string argument inside a grouping parenthesis on one line', () => {
        assert.deepEqual(format('${(ex.func("AAA") && !AAA) || BBB}'), [
            '${',
            '  (',
            '    ex.func("AAA") &&',
            '    !AAA',
            '  ) ||',
            '  BBB',
            '}'
        ]);
    });

    it('does not split on operators, braces and parentheses inside a literal with an escaped quote', () => {
        assert.deepEqual(format('${s != "\\"&&||{}()" && t}'), [
            '${',
            '  s != "\\"&&||{}()" &&',
            '  t',
            '}'
        ]);
    });
});

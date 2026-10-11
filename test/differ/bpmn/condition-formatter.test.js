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

    it('treats a parenthesis after ! as a grouping, not a function call', () => {
        assert.deepEqual(format('${!(a && b) && c}'), [
            '${',
            '  !(',
            '    a &&',
            '    b',
            '  ) &&',
            '  c',
            '}'
        ]);
    });

    it('collapses newlines and the source indentation of a multiline expression', () => {
        assert.deepEqual(format('${\n    a &&\n       b\n}'), [
            '${',
            '  a &&',
            '  b',
            '}'
        ]);
    });

    it('collapses tabs and runs of whitespace to layout indentation', () => {
        assert.deepEqual(format('${a\t&&\n\n   b}'), [
            '${',
            '  a &&',
            '  b',
            '}'
        ]);
    });

    it('does not leave trailing whitespace before a line break', () => {
        assert.deepEqual(format('${ a &&   b }'), [
            '${',
            '  a &&',
            '  b',
            '}'
        ]);
    });

    it('preserves significant whitespace inside string literals', () => {
        assert.deepEqual(format('${ s == "a  b" && c }'), [
            '${',
            '  s == "a  b" &&',
            '  c',
            '}'
        ]);
    });
});

describe('ConditionFormatter.format FEEL', () => {
    const formatter = new ConditionFormatter();
    const format = condition => Array.from(formatter.format(condition));

    it('splits FEEL and/or and keeps the leading =', () => {
        assert.deepEqual(format('=a and b or c'), ['=a and', 'b or', 'c']);
    });

    it('indents FEEL grouping parentheses', () => {
        assert.deepEqual(format('=paid and (segment = "REGULAR" or loyaltyYears >= 1)'), [
            '=paid and',
            '(',
            '  segment = "REGULAR" or',
            '  loyaltyYears >= 1',
            ')'
        ]);
    });

    it('keeps not( as a function call', () => {
        assert.deepEqual(format('=a and not(fraudSuspected)'), ['=a and', 'not(fraudSuspected)']);
    });

    it('does not split inside words or string literals', () => {
        assert.deepEqual(format('=order > 1 and brand = "android or ios"'),
            ['=order > 1 and', 'brand = "android or ios"']);
    });

    it('collapses the source line breaks of a multi-line FEEL condition', () => {
        assert.deepEqual(format('=paid and amount > 0\n  and not(fraudSuspected)'),
            ['=paid and', 'amount > 0 and', 'not(fraudSuspected)']);
    });

    it('keeps the and of a between … and … range', () => {
        assert.deepEqual(format('=x between 1 and 10 and y'), ['=x between 1 and 10 and', 'y']);
    });

    it('does not split after a path segment named or / and', () => {
        assert.deepEqual(format('=order.or > 1 and a.and'), ['=order.or > 1 and', 'a.and']);
    });

    it('leaves and/or alone in a JUEL expression', () => {
        assert.deepEqual(format('${a and b}'), ['${', '  a and b', '}']);
    });

    it('keeps a single-quoted JUEL string whole', () => {
        assert.deepEqual(format("${s == 'a && (b)' || t}"), ['${', "  s == 'a && (b)' ||", '  t', '}']);
    });

    it('a single quote opens no string in FEEL', () => {
        assert.deepEqual(format("= a' and b"), ["= a' and", 'b']);
    });
});

describe('ConditionFormatter.tokenize', () => {
    const formatter = new ConditionFormatter();
    const tokens = (line, feel) => Array.from(formatter.tokenize(line, feel), ({ text, kind }) => [text, kind]);
    const coloured = (line, feel) => tokens(line, feel).filter(([, kind]) => kind);

    it('JUEL: operators, keywords, strings and names', () => {
        assert.deepEqual(tokens("${a && b eq 'x'}", false), [
            ['${', null], ['a', 'name'], [' ', null], ['&&', 'keyword'], [' ', null], ['b', 'name'], [' ', null],
            ['eq', 'keyword'], [' ', null], ["'x'", 'string'], ['}', null]
        ]);
    });

    it('JUEL: empty, not, ||, comparisons and literals', () => {
        assert.deepEqual(coloured('${not empty list || x ge 10 and y == null}', false), [
            ['not', 'keyword'], ['empty', 'keyword'], ['list', 'name'], ['||', 'keyword'], ['x', 'name'],
            ['ge', 'keyword'], ['10', 'number'], ['and', 'keyword'], ['y', 'name'], ['null', 'keyword']
        ]);
    });

    it('FEEL: keywords, numbers and double-quoted strings', () => {
        assert.deepEqual(coloured('= amount > 100.5 and status = "open"', true), [
            ['amount', 'name'], ['100.5', 'number'], ['and', 'keyword'], ['status', 'name'], ['"open"', 'string']
        ]);
    });

    it('FEEL: between, some/satisfies, if/then/else, true', () => {
        assert.deepEqual(coloured('some x in xs satisfies x between 1 and 2', true).map(([text, kind]) => `${text}:${kind}`), [
            'some:keyword', 'x:name', 'in:keyword', 'xs:name', 'satisfies:keyword', 'x:name', 'between:keyword',
            '1:number', 'and:keyword', '2:number'
        ]);
        assert.deepEqual(coloured('if ok then true else false', true).map(([, kind]) => kind),
            ['keyword', 'name', 'keyword', 'keyword', 'keyword', 'keyword']);
    });

    it('a keyword inside a string stays part of the string', () => {
        assert.deepEqual(coloured('${s == "a and b && c"}', false), [['s', 'name'], ['"a and b && c"', 'string']]);
        assert.deepEqual(coloured('= s = "say \\"or\\" here"', true), [['s', 'name'], ['"say \\"or\\" here"', 'string']]);
    });

    it('a name with digits is a name; a JUEL word is a name in FEEL; a single quote is no FEEL string', () => {
        assert.deepEqual(coloured('${x1 > 2}', false), [['x1', 'name'], ['2', 'number']]);
        assert.deepEqual(coloured("= eq != 'a'", true), [['eq', 'name'], ['a', 'name']]);
    });

    it('the tokens join back to the line, indentation included', () => {
        for (const [line, feel] of [['    ${a && (b || c)}', false], ['  = x.y[1] and f(z, "q")', true], ['', true]]) {
            assert.equal(tokens(line, feel).map(([text]) => text).join(''), line);
        }
    });
});

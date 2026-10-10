// Formats a condition expression into indented lines for display: a JUEL
// expression splits after `&&` / `||`, a FEEL one (`=…`, Camunda 8) after the
// words `and` / `or`.
// Insignificant whitespace (spaces, tabs, newlines) outside string literals is
// collapsed: the formatter generates its own indentation, so the source layout
// of a long/complex expression does not leak into the output.
class ConditionFormatter {
    static #WORD_CHAR = /[\p{L}\p{N}_$]/u;
    static #WHITESPACE_CHAR = /\s/;

    format(condition) {
        // console.debug('format condition', condition);

        const feel = condition.trimStart().startsWith('=');
        // `between a and b` is one range: its `and` joins nothing
        let inBetween = false;
        const resultArr = [];
        const symbolArr = [];
        let indentSize = 0;
        let andOpStarted = false;
        let orOpStarted = false;
        let starting = true;
        let funcParenthesis = false;
        let insideString = false;
        let escapeFound = false;
        let pendingSpace = false;
        let lastChar = '';

        for (let i = 0; i < condition.length; i++) {
            const symbol = condition[i];

            if (insideString && symbol !== '"' && symbol !== '\\') {
                symbolArr.push(symbol);
                lastChar = symbol;
                continue;
            }

            // Collapse any whitespace run; it is emitted as a single space later,
            // unless it falls at the start of a line (leading indentation)
            if (ConditionFormatter.#WHITESPACE_CHAR.test(symbol)) {
                pendingSpace = true;
                continue;
            }

            if (pendingSpace) {
                if (!starting) {
                    symbolArr.push(' ');
                }
                pendingSpace = false;
            }
            starting = false;

            switch (symbol) {
                case '{':
                    symbolArr.push(symbol);
                    indentSize += 1;
                    this.#flush(resultArr, symbolArr, indentSize);
                    starting = true;
                    break;

                case '}':
                    indentSize -= 1;
                    this.#flush(resultArr, symbolArr, indentSize);
                    symbolArr.push(symbol);
                    break;

                case '(':
                    symbolArr.push(symbol);
                    // A call paren follows an identifier or a closing paren
                    // (e.g. 'fn(' or ')('); otherwise it is a grouping paren
                    // (e.g. '(', '!(', '&& ('), which gets its own indent level
                    if (ConditionFormatter.#isCallParen(lastChar)) {
                        funcParenthesis = true;
                    } else {
                        indentSize += 1;
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                    }
                    break;

                case ')':
                    if (funcParenthesis) {
                        symbolArr.push(symbol);
                        funcParenthesis = false;
                    } else {
                        indentSize -= 1;
                        this.#flush(resultArr, symbolArr, indentSize);
                        symbolArr.push(symbol);
                    }
                    break;

                case '&':
                    symbolArr.push(symbol);
                    if (andOpStarted) { // second &
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                        andOpStarted = false;
                    } else { // first &
                        andOpStarted = true;
                    }
                    break;

                case '|':
                    symbolArr.push(symbol);
                    if (orOpStarted) { // second |
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                        orOpStarted = false;
                    } else { // first |
                        orOpStarted = true;
                    }
                    break;

                case '"':
                    symbolArr.push(symbol);
                    if (escapeFound) {
                        escapeFound = false;
                    } else {
                        insideString = !insideString;
                    }
                    break;

                case '\\':
                    symbolArr.push(symbol);
                    escapeFound = !escapeFound;
                    break;

                default:
                    symbolArr.push(symbol);
                    andOpStarted = false;
                    orOpStarted = false;
                    escapeFound = false;
                    const word = feel && ConditionFormatter.#feelKeywordEnding(symbolArr, condition[i + 1]);
                    if (word === 'between') {
                        inBetween = true;
                    } else if (word === 'and' && inBetween) {
                        inBetween = false;
                    } else if (word === 'and' || word === 'or') {
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                        // a '(' after the operator is a grouping paren, not a call
                        lastChar = ' ';
                        continue;
                    }
            }

            lastChar = symbol;
        }
        if (symbolArr.length > 0) {
            this.#flush(resultArr, symbolArr, indentSize);
        }

        return resultArr;
    }

    // The FEEL keyword (`and`, `or`, `between`) the line ends with, when the next
    // char cannot continue the word: `order`, `android` and a path segment
    // (`order.or`) are no keywords.
    static #feelKeywordEnding(symbolArr, nextChar) {
        if (nextChar !== undefined && ConditionFormatter.#WORD_CHAR.test(nextChar)) {
            return null;
        }
        const match = /(?:^|[^\p{L}\p{N}_$.])(and|or|between)$/u.exec(symbolArr.join(''));
        return match ? match[1] : null;
    }

    static #isCallParen(lastChar) {
        return lastChar === ')' || ConditionFormatter.#WORD_CHAR.test(lastChar);
    }

    #flush(resultArr, symbolArr, indentSize) {
        // trimEnd drops the trailing space a collapsed whitespace run leaves
        // before a line break
        resultArr.push(symbolArr.join('').trimEnd());

        symbolArr.length = 0;
        for (let i = 0; i < indentSize; i++) {
            symbolArr.push(...'  ');
        }
    }
}

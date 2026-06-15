// Formats a condition expression into indented lines for display
class ConditionFormatter {
    format(condition) {
        // console.debug('format condition', condition);

        const resultArr = [];
        const symbolArr = [];
        let indentSize = 0;
        let andOpStarted = false;
        let orOpStarted = false;
        let starting = true;
        let funcParenthesis = false;
        let insideString = false;
        let escapeFound = false;

        for (let i = 0; i < condition.length; i++) {
            const symbol = condition[i];

            if (insideString && symbol !== '"' && symbol !== '\\') {
                symbolArr.push(symbol);
                continue;
            }

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
                    starting = true;
                    symbolArr.push(symbol);
                    starting = false;
                    break;

                case '(':
                    symbolArr.push(symbol);
                    if (starting) {
                        indentSize += 1;
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                    } else {
                        funcParenthesis = true;
                    }
                    break;

                case ')':
                    if (funcParenthesis) {
                        symbolArr.push(symbol);
                        funcParenthesis = false;
                    } else {
                        indentSize -= 1;
                        this.#flush(resultArr, symbolArr, indentSize);
                        starting = true;
                        symbolArr.push(symbol);
                        starting = false;
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
                        if (insideString) {
                            insideString = false;
                        } else {
                            insideString = true;
                        }
                    }
                    break;

                case '\\':
                    symbolArr.push(symbol);
                    if (escapeFound) {
                        escapeFound = false;
                    } else {
                        escapeFound = true;
                    }
                    break;

                case ' ':
                    if (starting) {
                        break;
                    }
                // Else no break and go to default branch

                default:
                    symbolArr.push(symbol);
                    andOpStarted = false;
                    orOpStarted = false;
                    starting = false;
                    escapeFound = false;
            }
        }
        if (symbolArr.length > 0) {
            this.#flush(resultArr, symbolArr, indentSize);
        }

        return resultArr;
    }

    #flush(resultArr, symbolArr, indentSize) {
        resultArr.push(symbolArr.join(''));

        symbolArr.length = 0;
        for (let i = 0; i < indentSize; i++) {
            symbolArr.push(...'  ');
        }
    }
}

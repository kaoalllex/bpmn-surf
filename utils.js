function removeElement(elementId) {
    const elem = document.getElementById(elementId);
    if (elem) {
        elem.parentElement.removeChild(elem);
    }
}

async function loadFileContent(fileUrl, throwIf404) {
    try {
        const response = await fetch(fileUrl);
        if (response.status === 404) {
            if (throwIf404) {
                throw new Error('File not found: ' + fileUrl);
            } else {
                return null;
            }
        } else if (!response.ok) {
            throw new Error('Cannot load file content by url: ' + fileUrl);
        }
        const content = await response.text();
        return content;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

function getFileNameFromPath(path) {
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doWithAttempts(action, attempts = 10, delayMs = 150) {
    for (let index = 0; index < attempts; index++) {
        var res = action();
        if (res) {
            return res;
        }
        await delay(delayMs);
    }
    return null;
}

function requireDefined(arg, argName) {
    if (!arg) {
        throw new Error(`${argName} is undefined`);
    }
    return arg;
}

function appendTimeToConsoleLogs() {
    const formatter = new Intl.DateTimeFormat('en', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        fractionalSecondDigits: 3
    });
    const handler = {
        apply: function (target, thisArg, argArray) {
            const ts = formatter.format(new Date());
            target.apply(console, [`${ts}:`, ...argArray]);
        }
    };

    console.debug = new Proxy(console.debug, handler);
    console.info = new Proxy(console.info, handler);
    console.warn = new Proxy(console.warn, handler);
    console.error = new Proxy(console.error, handler);
}

function parseXml(xml) {
    const parser = new DOMParser();
    return parser.parseFromString(xml, 'text/xml');
}

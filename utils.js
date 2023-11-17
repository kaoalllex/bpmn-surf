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

async function findElementWithDelay(searchFunction, tries = 10, delayMs = 150) {
    for (let index = 0; index < tries; index++) {
        var element = searchFunction();
        if (element) {
            return element;
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

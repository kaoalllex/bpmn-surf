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

function getFileNameWithoutExtensionFromPath(path) {
    const filename = getFileNameFromPath(path);
    return filename.substring(0, filename.lastIndexOf('.'));
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

function capitalizeFirstLetter(string) {
    if (string.length === 0) {
        return string;
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getTitle(fileName) {
    return fileName.replace(/(.{31})/g, "$1 ");
}

async function openDiffer(params, extParams, msgId, getResourceUrlByNameFunc) {
    console.debug('opening differ...');
    const newWindow = window.open('about:blank');
    if (!newWindow) {
        console.error('failed to open new window');
        return false;
    }

    console.debug('setting title...');
    newWindow.document.title = getTitle(params.fileName);

    console.debug('loading scripts...');
    await loadScripts(newWindow.document, getResourceUrlByNameFunc);
    console.debug('loading scripts...done');

    if (extParams) {
        params = { ...params, ...extParams };
    }
    const msg = {
        id: msgId,
        params: params
    }
    console.debug('sending message...');
    newWindow.postMessage(msg, '*');
    console.debug('opening differ...done');
    return true;
}

async function loadScripts(doc, getResourceUrlByNameFunc) {
    await addStylesheet('libs/bpmn-js/assets/bpmn-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js/assets/diagram-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js/assets/bpmn-font/css/bpmn.css', doc, getResourceUrlByNameFunc);
    await addScript('libs/bpmn-js/bpmn-modeler.production.min.js', doc, getResourceUrlByNameFunc);

    await addStylesheet('libs/dmn-js/assets/diagram-js.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-decision-table-controls.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-decision-table.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-drd.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-literal-expression.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-js-shared.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/dmn-js/assets/dmn-font/css/dmn.css', doc, getResourceUrlByNameFunc);

    // TODO: when uses production.min then get error:
    //  It looks like you're using a minified copy of the development build of Inferno...
    await addScript('libs/dmn-js/dmn-viewer.development.js', doc, getResourceUrlByNameFunc);

    // properties panel
    await addStylesheet('libs/bpmn-js-properties-panel/assets/element-templates.css', doc, getResourceUrlByNameFunc);
    await addStylesheet('libs/bpmn-js-properties-panel/assets/properties-panel.css', doc, getResourceUrlByNameFunc);
    await addScript('libs/bpmn-js-properties-panel/bpmn-js-properties-panel.umd.js', doc, getResourceUrlByNameFunc);

    await addStylesheet('styles.css', doc, getResourceUrlByNameFunc);
    await addScript('utils.js', doc, getResourceUrlByNameFunc);
    await addScript('bpmn-differ.js', doc, getResourceUrlByNameFunc);
    await addScript('dmn-differ.js', doc, getResourceUrlByNameFunc);
}

async function addStylesheet(resourceName, doc, getResourceUrlByNameFunc) {
    return new Promise((resolve, reject) => {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = getResourceUrlByNameFunc(resourceName);
        doc.head.appendChild(link);
        link.onload = () => { resolve(link); };
        link.onerror = () => { reject(new Error(`Loading failed: ${resourceName}`)); };
    });
}

async function addScript(resourceName, doc, getResourceUrlByNameFunc) {
    return new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = getResourceUrlByNameFunc(resourceName);
        doc.head.appendChild(script);
        script.onload = () => { resolve(script); };
        script.onerror = () => { reject(new Error(`Loading failed: ${resourceName}`)); };
    });
}

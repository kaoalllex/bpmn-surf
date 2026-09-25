// Persistent user settings (FEAT-0035).
//
// Until now the only setting was the list of sites, and that list IS the granted
// optional host permissions — nothing was stored. The handler annotations have
// no such natural home, so they live in chrome.storage.sync: it follows the
// user's Chrome profile, which is what makes "export once, hand it to the team"
// worth having in the first place.
//
// Loaded in the popup and the content script. NOT on the differ page: that tab
// is an about:blank inheriting the GitLab origin and has no chrome.*, so the
// values it needs travel there inside the differ params (diff-params-builder.js).

const SETTINGS_STORAGE_KEY = 'settings';

// Version of the export file format, so a future change can migrate instead of
// silently mis-reading an old file.
const SETTINGS_EXPORT_FORMAT = 1;

async function loadSettings() {
    try {
        const stored = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
        return (stored && stored[SETTINGS_STORAGE_KEY]) || {};
    } catch (error) {
        // A storage read can fail (quota, profile without sync); running with the
        // defaults is better than breaking the page the extension is injected in.
        console.warn('cannot read settings, using defaults', error);
        return {};
    }
}

async function loadHandlerAnnotations() {
    return normalizeHandlerAnnotations((await loadSettings()).handlerAnnotations);
}

async function saveHandlerAnnotations(annotations) {
    const normalized = normalizeHandlerAnnotations(annotations);
    const settings = await loadSettings();
    settings.handlerAnnotations = normalized;
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings });
    return normalized;
}

/**
 * The settings file handed to a colleague: the sites to run on plus the handler
 * annotations. Host permissions are named, not granted — importing asks Chrome
 * for them, which only the receiving user can allow.
 */
function buildSettingsExport({ hosts, handlerAnnotations, version }) {
    return {
        format: SETTINGS_EXPORT_FORMAT,
        exportedBy: `bpmn-surf ${version}`,
        exportedAt: new Date().toISOString(),
        // Bare hostnames, not match patterns: readable in the file, and they are
        // what normalizeHostPattern() accepts back (it rejects anything with a *).
        hosts: [...new Set(hosts.map(h => String(h).replace(/^https:\/\//, '').replace(/\/\*$/, '')))],
        handlerAnnotations: normalizeHandlerAnnotations(handlerAnnotations)
    };
}

/**
 * Validates and normalises a settings file. Throws with a readable reason rather
 * than importing half of a malformed file.
 * @returns {{hosts: string[], handlerAnnotations: {topic: string[], className: string[]}}}
 */
function parseSettingsExport(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error('not a JSON file');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not a settings file');
    }
    if (parsed.format !== SETTINGS_EXPORT_FORMAT) {
        throw new Error(`unsupported format ${JSON.stringify(parsed.format)}`);
    }

    const hosts = [];
    for (const entry of (Array.isArray(parsed.hosts) ? parsed.hosts : [])) {
        const pattern = normalizeHostPattern(String(entry || ''));
        if (pattern) {
            hosts.push(pattern);
        }
    }
    return {
        hosts: [...new Set(hosts)],
        handlerAnnotations: normalizeHandlerAnnotations(parsed.handlerAnnotations)
    };
}

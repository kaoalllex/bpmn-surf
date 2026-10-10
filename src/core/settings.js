// Persistent user settings (FEAT-0035).
//
// Until now the only setting was the list of sites, and that list IS the granted
// optional host permissions — nothing was stored. The handler annotations and
// the type the user pinned a site to have no such natural home, so they live in
// chrome.storage.sync: it follows the user's Chrome profile, which is what makes
// "export once, hand it to the team" worth having in the first place. The sites
// whose type is still unknown are this browser's own state: chrome.storage.local.
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

// The platform.kind values a user may pin a site to (FEAT-0033 sites; detection
// in platform-detection.js). Bare hostnames as keys, like the exported hosts.
const SITE_KINDS = ['gitlab', 'github'];

function normalizeSiteKinds(value) {
    const kinds = {};
    for (const [host, kind] of Object.entries(value && typeof value === 'object' ? value : {})) {
        if (SITE_KINDS.includes(kind) && normalizeHostPattern(host) === `https://${host}/*`) {
            kinds[host] = kind;
        }
    }
    return kinds;
}

async function loadSiteKinds() {
    return normalizeSiteKinds((await loadSettings()).siteKinds);
}

/**
 * @param {Object<string, string|null>} changes hostname -> kind; null (or any
 *        non-kind) forgets the site's choice
 */
async function saveSiteKinds(changes) {
    const settings = await loadSettings();
    const kinds = normalizeSiteKinds(settings.siteKinds);
    for (const [host, kind] of Object.entries(changes)) {
        if (SITE_KINDS.includes(kind)) {
            kinds[host] = kind;
        } else {
            delete kinds[host];
        }
    }
    settings.siteKinds = kinds;
    await chrome.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings });
}

async function loadUndetectedSites() {
    try {
        const { [UNDETECTED_SITES_KEY]: stored } = await chrome.storage.local.get(UNDETECTED_SITES_KEY);
        return (stored && Array.isArray(stored.hosts)) ? stored.hosts : [];
    } catch (error) {
        return [];
    }
}

async function reportUndetectedSite(hostname) {
    const hosts = await loadUndetectedSites();
    if (!hosts.includes(hostname)) {
        await chrome.storage.local.set({ [UNDETECTED_SITES_KEY]: { hosts: [...hosts, hostname] } });
    }
}

async function clearUndetectedSite(hostname) {
    const hosts = await loadUndetectedSites();
    if (hosts.includes(hostname)) {
        await chrome.storage.local.set({ [UNDETECTED_SITES_KEY]: { hosts: hosts.filter(h => h !== hostname) } });
    }
}

/**
 * The settings file handed to a colleague: the sites to run on, how each is
 * read, plus the handler annotations. Host permissions are named, not granted —
 * importing asks Chrome for them, which only the receiving user can allow.
 */
function buildSettingsExport({ hosts, handlerAnnotations, siteKinds = {}, version }) {
    // Bare hostnames, not match patterns: readable in the file, and they are
    // what normalizeHostPattern() accepts back (it rejects anything with a *).
    const bareHosts = [...new Set(hosts.map(h => String(h).replace(/^https:\/\//, '').replace(/\/\*$/, '')))];
    return {
        format: SETTINGS_EXPORT_FORMAT,
        exportedBy: `bpmn-surf ${version}`,
        exportedAt: new Date().toISOString(),
        hosts: bareHosts,
        handlerAnnotations: normalizeHandlerAnnotations(handlerAnnotations),
        siteKinds: Object.fromEntries(Object.entries(normalizeSiteKinds(siteKinds)).filter(([h]) => bareHosts.includes(h)))
    };
}

/**
 * Validates and normalises a settings file. Throws with a readable reason rather
 * than importing half of a malformed file.
 * @returns {{hosts: string[], handlerAnnotations: {topic: string[], className: string[]}, siteKinds: Object<string, string>}}
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
    const bareHosts = hosts.map(p => p.slice('https://'.length, -2));
    return {
        hosts: [...new Set(hosts)],
        handlerAnnotations: normalizeHandlerAnnotations(parsed.handlerAnnotations),
        siteKinds: Object.fromEntries(Object.entries(normalizeSiteKinds(parsed.siteKinds)).filter(([h]) => bareHosts.includes(h)))
    };
}

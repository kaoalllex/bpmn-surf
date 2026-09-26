'use strict';

// Extension popup UI: the installed version, the feedback link and the settings —
// the sites the extension runs on (FEAT-0033), the handler annotations
// (FEAT-0035) and the settings file that carries both. Works as an action popup
// and as a tab.
//
// Each settings group is its own screen rather than another block on one page:
// a popup window is ~340px wide and the explanations do not fit beside the
// controls. Home lists the groups with a one-line summary each.
//
// There is no host list to store: the granted optional host permissions are the
// list (docs/conventions.md, "Persistent settings"). The service worker watches
// the same permissions and keeps the content-script registrations in sync. The
// annotations have no such natural home and do live in chrome.storage.sync.

const DECLARED_MATCHES = chrome.runtime.getManifest().content_scripts[0].matches;

const VIEW_TITLES = {
    home: 'bpmn-surf',
    sites: 'Sites',
    annotations: 'External task handler annotations',
    file: 'Settings file'
};

const els = {
    headerTitle: document.getElementById('headerTitle'),
    backBtn: document.getElementById('backBtn'),
    logo: document.querySelector('.pu-logo'),
    currentVersion: document.getElementById('currentVersion'),
    feedbackLink: document.getElementById('feedbackLink'),
    sitesSummary: document.getElementById('sitesSummary'),
    annSummary: document.getElementById('annSummary'),

    siteList: document.getElementById('siteList'),
    addHostForm: document.getElementById('addHostForm'),
    hostInput: document.getElementById('hostInput'),
    hostError: document.getElementById('hostError'),

    topicAnnList: document.getElementById('topicAnnList'),
    classAnnList: document.getElementById('classAnnList'),
    addTopicAnnForm: document.getElementById('addTopicAnnForm'),
    addClassAnnForm: document.getElementById('addClassAnnForm'),
    topicAnnInput: document.getElementById('topicAnnInput'),
    classAnnInput: document.getElementById('classAnnInput'),
    annError: document.getElementById('annError'),
    annWarning: document.getElementById('annWarning'),

    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importInput: document.getElementById('importInput'),
    grantImportedBtn: document.getElementById('grantImportedBtn'),
    ioError: document.getElementById('ioError'),
    ioNote: document.getElementById('ioNote')
};

function hostOf(pattern) {
    return pattern.replace(/^https:\/\//, '').replace(/\/\*$/, '');
}

function setMessage(element, message) {
    element.textContent = message || '';
    element.classList.toggle('hidden', !message);
}

function showError(message) {
    setMessage(els.hostError, message);
}

function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// ==== Screens ====

function showView(name) {
    for (const view of document.querySelectorAll('.pu-view')) {
        view.classList.toggle('hidden', view.dataset.view !== name);
    }
    els.headerTitle.textContent = VIEW_TITLES[name] || VIEW_TITLES.home;
    const home = name === 'home';
    els.backBtn.classList.toggle('hidden', home);
    els.logo.classList.toggle('hidden', !home);
    // Leaving a screen drops whatever it was complaining about.
    setMessage(els.hostError, '');
    setMessage(els.annError, '');
}

for (const button of document.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => showView(button.dataset.open));
}
els.backBtn.addEventListener('click', () => showView('home'));

// ==== Sites (FEAT-0033) ====

// A declared match is injected by Chrome itself and cannot be unregistered
// through the API — it is shown as built-in rather than with a remove button.
function appendSite(pattern, builtIn) {
    const host = hostOf(pattern);
    const item = document.createElement('li');
    item.className = 'pu-site';

    const name = document.createElement('span');
    name.className = 'pu-site-host';
    name.textContent = host;
    item.appendChild(name);

    if (builtIn) {
        const badge = document.createElement('span');
        badge.className = 'pu-site-badge';
        badge.textContent = 'built-in';
        item.appendChild(badge);
    } else {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pu-site-remove';
        remove.title = `Remove ${host}`;
        remove.textContent = '×';
        remove.addEventListener('click', () => removeHost(pattern));
        item.appendChild(remove);
    }

    els.siteList.appendChild(item);
}

async function renderSites() {
    const { origins } = await chrome.permissions.getAll();
    const userPatterns = userOriginsFrom(origins, DECLARED_MATCHES);
    els.siteList.textContent = '';
    for (const pattern of DECLARED_MATCHES) {
        appendSite(pattern, true);
    }
    for (const pattern of userPatterns) {
        appendSite(pattern, false);
    }
    els.sitesSummary.textContent = [...DECLARED_MATCHES, ...userPatterns].map(hostOf).join(', ');
}

async function removeHost(pattern) {
    await chrome.permissions.remove({ origins: [pattern] });
    await renderSites();
}

els.addHostForm.addEventListener('submit', event => {
    event.preventDefault();
    const pattern = normalizeHostPattern(els.hostInput.value);
    if (!pattern) {
        showError('Enter an https host, for example gitlab.mycompany.com');
        return;
    }
    showError('');
    // Chrome grants the permission only while the user gesture is live, so the
    // request must be issued in this same task — nothing is awaited before it.
    chrome.permissions.request({ origins: [pattern] })
        .then(granted => {
            if (granted) {
                els.hostInput.value = '';
            }
            return renderSites();
        })
        .catch(e => showError(String((e && e.message) || e)));
});

// ==== Handler annotations (FEAT-0035) ====

// Removing the last entry of a style is allowed: it switches that style off.
function appendAnnotation(list, name, onRemove) {
    const item = document.createElement('li');
    item.className = 'pu-site';

    const label = document.createElement('span');
    label.className = 'pu-site-host';
    label.textContent = `@${name}`;
    item.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pu-site-remove';
    remove.title = `Remove @${name}`;
    remove.textContent = '×';
    remove.addEventListener('click', () => onRemove(name));
    item.appendChild(remove);

    list.appendChild(item);
}

async function renderAnnotations() {
    const annotations = await loadHandlerAnnotations();

    els.topicAnnList.textContent = '';
    for (const name of annotations.topic) {
        appendAnnotation(els.topicAnnList, name, n => removeAnnotation('topic', n));
    }

    els.classAnnList.textContent = '';
    for (const name of annotations.className) {
        appendAnnotation(els.classAnnList, name, n => removeAnnotation('className', n));
    }

    const total = annotations.topic.length + annotations.className.length;
    els.annWarning.classList.toggle('hidden', total > 0);
    els.annSummary.textContent = total === 0
        ? 'none — external tasks will not link to code'
        : [...annotations.topic, ...annotations.className].map(n => `@${n}`).join(', ');
    return annotations;
}

async function removeAnnotation(style, name) {
    const annotations = await loadHandlerAnnotations();
    annotations[style] = annotations[style].filter(n => n !== name);
    await saveHandlerAnnotations(annotations);
    await renderAnnotations();
}

async function addAnnotation(style, rawValue) {
    const annotations = await loadHandlerAnnotations();
    const candidate = normalizeHandlerAnnotations({ [style]: [...annotations[style], rawValue] })[style];
    if (candidate.length === annotations[style].length) {
        setMessage(els.annError,
            annotations[style].includes(String(rawValue).trim().replace(/^@/, ''))
                ? 'That annotation is already listed'
                : 'Enter an annotation name, for example ExternalTaskSubscription');
        return false;
    }
    annotations[style] = candidate;
    await saveHandlerAnnotations(annotations);
    setMessage(els.annError, '');
    await renderAnnotations();
    return true;
}

function wireAnnotationForm(form, input, style) {
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (await addAnnotation(style, input.value)) {
            input.value = '';
        }
    });
}

wireAnnotationForm(els.addTopicAnnForm, els.topicAnnInput, 'topic');
wireAnnotationForm(els.addClassAnnForm, els.classAnnInput, 'className');

// ==== Settings file ====

els.exportBtn.addEventListener('click', async () => {
    setMessage(els.ioError, '');
    try {
        const { origins } = await chrome.permissions.getAll();
        const file = buildSettingsExport({
            hosts: userOriginsFrom(origins, DECLARED_MATCHES),
            handlerAnnotations: await loadHandlerAnnotations(),
            version: chrome.runtime.getManifest().version
        });
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bpmn-surf-settings.json';
        link.click();
        URL.revokeObjectURL(url);
        setMessage(els.ioNote, `Exported ${plural(file.hosts.length, 'site')} and the annotations.`);
    } catch (error) {
        setMessage(els.ioError, String((error && error.message) || error));
    }
});

els.importBtn.addEventListener('click', () => els.importInput.click());

els.importInput.addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    // Let the same file be picked again after a failed attempt.
    event.target.value = '';
    if (!file) {
        return;
    }
    setMessage(els.ioError, '');
    setMessage(els.ioNote, '');
    els.grantImportedBtn.classList.add('hidden');
    try {
        const imported = parseSettingsExport(await file.text());
        await saveHandlerAnnotations(imported.handlerAnnotations);
        await renderAnnotations();

        const { origins } = await chrome.permissions.getAll();
        const granted = new Set([...origins, ...DECLARED_MATCHES]);
        const missing = imported.hosts.filter(h => !granted.has(h));
        if (missing.length === 0) {
            setMessage(els.ioNote, 'Imported. Every site in the file is already allowed.');
            return;
        }
        // Chrome only grants a permission while a user gesture is live, and
        // reading the file consumed this one — so the request gets its own click.
        setMessage(els.ioNote, 'Annotations imported. The sites still need your permission.');
        els.grantImportedBtn.textContent = `Allow ${missing.map(hostOf).join(', ')}`;
        els.grantImportedBtn.classList.remove('hidden');
        els.grantImportedBtn.onclick = () => {
            chrome.permissions.request({ origins: missing })
                .then(async ok => {
                    els.grantImportedBtn.classList.add('hidden');
                    setMessage(els.ioNote, ok ? 'Sites allowed.' : 'Sites were not allowed.');
                    await renderSites();
                })
                .catch(e => setMessage(els.ioError, String((e && e.message) || e)));
        };
    } catch (error) {
        setMessage(els.ioError, `Cannot import: ${(error && error.message) || error}`);
    }
});

els.currentVersion.textContent = `v${chrome.runtime.getManifest().version}`;
els.feedbackLink.href = FEEDBACK_URL;
showView('home');
renderSites();
renderAnnotations();

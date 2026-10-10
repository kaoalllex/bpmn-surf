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
// annotations have no such natural home and do live in chrome.storage.sync, and
// so do the site types (GitLab or GitHub) the user picks for their own hosts.

const TOPIC_ANNOTATION_SUGGESTIONS = ['ExternalTaskSubscription', 'JobWorker', 'ZeebeWorker'];
const SITE_SUGGESTIONS = ['gitlab.com', 'github.com'];

const VIEW_TITLES = {
    home: 'bpmn-surf',
    sites: 'Sites',
    annotations: 'Handler annotations',
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
    gitlabComNotice: document.getElementById('gitlabComNotice'),
    gitlabComOn: document.getElementById('gitlabComOn'),
    gitlabComDismiss: document.getElementById('gitlabComDismiss'),
    noSitesHomeWarning: document.getElementById('noSitesHomeWarning'),
    undetectedHomeWarning: document.getElementById('undetectedHomeWarning'),
    undetectedHosts: document.getElementById('undetectedHosts'),

    noSitesWarning: document.getElementById('noSitesWarning'),
    siteList: document.getElementById('siteList'),
    addHostForm: document.getElementById('addHostForm'),
    hostInput: document.getElementById('hostInput'),
    hostSuggestions: document.getElementById('hostSuggestions'),
    hostError: document.getElementById('hostError'),

    topicAnnList: document.getElementById('topicAnnList'),
    classAnnList: document.getElementById('classAnnList'),
    addTopicAnnForm: document.getElementById('addTopicAnnForm'),
    addClassAnnForm: document.getElementById('addClassAnnForm'),
    topicAnnInput: document.getElementById('topicAnnInput'),
    topicAnnSuggestions: document.getElementById('topicAnnSuggestions'),
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

const BUILT_IN_KINDS = { 'github.com': 'GitHub', 'gitlab.com': 'GitLab' };

function appendSite(pattern, kind, undetected) {
    const host = hostOf(pattern);
    const item = document.createElement('li');
    item.className = 'pu-site';

    const name = document.createElement('span');
    name.className = 'pu-site-host';
    name.textContent = host;
    item.appendChild(name);

    if (!BUILT_IN_KINDS[host]) {
        const select = document.createElement('select');
        select.className = 'pu-site-kind';
        select.title = `How bpmn-surf reads ${host}`;
        for (const [value, label] of [['', 'Auto'], ['gitlab', 'GitLab'], ['github', 'GitHub']]) {
            select.add(new Option(label, value, false, value === (kind || '')));
        }
        select.addEventListener('change', () => setSiteKind(host, select.value || null));
        item.appendChild(select);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pu-site-remove';
    remove.title = `Remove ${host}`;
    remove.textContent = '×';
    remove.addEventListener('click', () => removeHost(pattern));
    item.appendChild(remove);

    if (undetected && !kind) {
        item.classList.add('pu-site-undetected');
        const note = document.createElement('div');
        note.className = 'pu-site-note';
        note.textContent = 'Not recognised as GitLab or GitHub — pick its type, then reload the page.';
        item.appendChild(note);
    }

    els.siteList.appendChild(item);
}

async function setSiteKind(host, kind) {
    await saveSiteKinds({ [host]: kind });
    await clearUndetectedSite(host);
    await renderSites();
}

async function renderSites() {
    const { origins } = await chrome.permissions.getAll();
    const sites = userOriginsFrom(origins);
    const kinds = await loadSiteKinds();
    const undetected = pruneUndetectedSites(await loadUndetectedSites(), origins);
    els.siteList.textContent = '';
    sites.forEach(p => appendSite(p, kinds[hostOf(p)], undetected.includes(hostOf(p))));
    const waiting = undetected.filter(h => !kinds[h]);
    els.undetectedHosts.textContent = waiting.join(', ');
    els.undetectedHomeWarning.classList.toggle('hidden', !waiting.length);
    fillSuggestions(els.hostSuggestions, SITE_SUGGESTIONS, sites.map(hostOf));
    els.sitesSummary.textContent = sites.length ? sites.map(hostOf).join(', ') : 'No site yet';
    els.noSitesWarning.classList.toggle('hidden', sites.length > 0);
    els.noSitesHomeWarning.classList.toggle('hidden', sites.length > 0);
    const { [GITLAB_COM_NOTICE_KEY]: notice } = await chrome.storage.local.get(GITLAB_COM_NOTICE_KEY);
    els.gitlabComNotice.classList.toggle('hidden', !notice || sites.includes(GITLAB_COM));
}

// Chrome grants a permission only while the click's gesture is live — the
// request is issued before anything is awaited.
els.gitlabComOn.addEventListener('click', () => {
    chrome.permissions.request({ origins: [GITLAB_COM] })
        .then(() => renderSites())
        .catch(e => showError(String((e && e.message) || e)));
});
els.gitlabComDismiss.addEventListener('click', async () => {
    await chrome.storage.local.remove(GITLAB_COM_NOTICE_KEY);
    await renderSites();
});

async function removeHost(pattern) {
    await chrome.permissions.remove({ origins: [pattern] });
    await saveSiteKinds({ [hostOf(pattern)]: null });
    await clearUndetectedSite(hostOf(pattern));
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

// Native suggestions for an add field: the known values not yet in its list;
// free text is still accepted.
function fillSuggestions(datalist, values, taken) {
    datalist.textContent = '';
    for (const value of values.filter(v => !taken.includes(v))) {
        const option = document.createElement('option');
        option.value = value;
        datalist.appendChild(option);
    }
}

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

    fillSuggestions(els.topicAnnSuggestions, TOPIC_ANNOTATION_SUGGESTIONS, annotations.topic);

    const total = annotations.topic.length + annotations.className.length;
    els.annWarning.classList.toggle('hidden', total > 0);
    els.annSummary.textContent = total === 0
        ? 'none — tasks will not link to code'
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
            hosts: userOriginsFrom(origins),
            handlerAnnotations: await loadHandlerAnnotations(),
            siteKinds: await loadSiteKinds(),
            version: chrome.runtime.getManifest().version
        });
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bpmn-surf-settings.json';
        link.click();
        URL.revokeObjectURL(url);
        setMessage(els.ioNote, `Exported ${plural(file.hosts.length, 'site')}, their types and the annotations.`);
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
        await saveSiteKinds(imported.siteKinds);
        for (const host of Object.keys(imported.siteKinds)) {
            await clearUndetectedSite(host);
        }
        await renderSites();
        await renderAnnotations();

        const { origins } = await chrome.permissions.getAll();
        const granted = new Set(origins);
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

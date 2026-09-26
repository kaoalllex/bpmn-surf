const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createScope } = require('#scope');

const { buildSettingsExport, parseSettingsExport, SETTINGS_EXPORT_FORMAT } = createScope();

// The storage helpers (loadSettings / loadHandlerAnnotations / saveHandlerAnnotations)
// are thin chrome.storage.sync wrappers and are exercised by hand in the popup;
// what is worth pinning here is the file two people exchange.

describe('buildSettingsExport', () => {
    it('writes bare hostnames so the file reads back through normalizeHostPattern', () => {
        const file = buildSettingsExport({
            hosts: ['https://gitlab.mycompany.com/*', 'https://gitlab.com/*'],
            handlerAnnotations: { className: ['ExternalTaskBean'] },
            version: '1.2.0'
        });
        assert.deepEqual(file.hosts, ['gitlab.mycompany.com', 'gitlab.com']);
        assert.equal(file.format, SETTINGS_EXPORT_FORMAT);
        assert.equal(file.exportedBy, 'bpmn-surf 1.2.0');
        assert.deepEqual(file.handlerAnnotations, {
            topic: ['ExternalTaskSubscription'],
            className: ['ExternalTaskBean']
        });
    });

    it('round-trips through parseSettingsExport', () => {
        const file = buildSettingsExport({
            hosts: ['https://gitlab.mycompany.com/*'],
            handlerAnnotations: { topic: ['ExternalTaskSubscription'], className: ['ExternalTaskBean'] },
            version: '1.2.0'
        });
        const parsed = parseSettingsExport(JSON.stringify(file));
        assert.deepEqual(parsed.hosts, ['https://gitlab.mycompany.com/*']);
        assert.deepEqual(parsed.handlerAnnotations.className, ['ExternalTaskBean']);
    });
});

describe('parseSettingsExport', () => {
    const file = (over) => JSON.stringify({ format: SETTINGS_EXPORT_FORMAT, hosts: [], ...over });

    it('turns hostnames into match patterns and drops unusable ones', () => {
        const parsed = parseSettingsExport(file({
            hosts: ['gitlab.mycompany.com', 'https://gitlab.com/mr/1', 'http://insecure.example', '*', '']
        }));
        assert.deepEqual(parsed.hosts, ['https://gitlab.mycompany.com/*', 'https://gitlab.com/*']);
    });

    it('de-duplicates hosts that normalise to the same pattern', () => {
        const parsed = parseSettingsExport(file({
            hosts: ['gitlab.com', 'https://gitlab.com/', 'https://gitlab.com/-/profile']
        }));
        assert.deepEqual(parsed.hosts, ['https://gitlab.com/*']);
    });

    it('falls back to the default annotations when the file omits them', () => {
        assert.deepEqual(parseSettingsExport(file()).handlerAnnotations, {
            topic: ['ExternalTaskSubscription'],
            className: []
        });
    });

    it('rejects a file it cannot vouch for, naming the reason', () => {
        assert.throws(() => parseSettingsExport('not json'), /not a JSON file/);
        assert.throws(() => parseSettingsExport('[]'), /not a settings file/);
        assert.throws(() => parseSettingsExport('null'), /not a settings file/);
        assert.throws(() => parseSettingsExport(file({ format: 99 })), /unsupported format 99/);
        assert.throws(() => parseSettingsExport('{}'), /unsupported format undefined/);
    });
});

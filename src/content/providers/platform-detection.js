/**
 * Single source of truth for "which code-hosting platform is this page?"
 * The returned `kind` is the discriminator the differ keys on (`platform.kind`);
 * content-scope consumers (repo-provider-factory, fallback-repo-provider,
 * diff-params-builder) all detect through here.
 *
 * github.com and gitlab.com are known by name. Any other host is one the user
 * added in the popup: their choice there wins; otherwise the page tells —
 * GitHub Enterprise Server carries github.com's markup, every GitLab renders
 * body[data-page]. A page that says neither returns null and the user is asked
 * (main.js). Pure apart from the override main.js sets once per page.
 */

// The platform.kind vocabulary, shared by every content-scope consumer so the
// raw 'gitlab'/'github' strings live in exactly one place.
const PLATFORM_KIND = {
    GITLAB: 'gitlab',
    GITHUB: 'github'
};

const KNOWN_HOSTS = { 'github.com': PLATFORM_KIND.GITHUB, 'gitlab.com': PLATFORM_KIND.GITLAB };

let siteKindOverride = null;

function setSiteKindOverride(kind) {
    siteKindOverride = Object.values(PLATFORM_KIND).includes(kind) ? kind : null;
}

function detectPlatformKind(location = window.location, doc = document) {
    return KNOWN_HOSTS[location.hostname] || siteKindOverride || platformKindFromMarkup(doc);
}

function platformKindFromMarkup(doc) {
    const siteNameMeta = doc.querySelector('meta[property="og:site_name"]');
    const siteName = (siteNameMeta && siteNameMeta.getAttribute('content')) || '';
    if (siteName.startsWith('GitHub') || doc.querySelector('meta[name="expected-hostname"]')) {
        return PLATFORM_KIND.GITHUB;
    }
    if (siteName === 'GitLab' || doc.querySelector('body[data-page]')) {
        return PLATFORM_KIND.GITLAB;
    }
    return null;
}

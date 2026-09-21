/**
 * Single source of truth for "which code-hosting platform is this page?"
 * (REFAC-0004 step 1.4). The returned `kind` is the same discriminator the
 * differ scope keys on (`platform.kind`); content-scope consumers
 * (repo-provider-factory, GitLabRepoProviderBase.isAvailable, diff-params-builder)
 * all detect through here so adding a platform is a one-line matcher change.
 *
 * Pure and dependency-free: the `location` argument (defaulting to
 * `window.location`) keeps it unit-testable without globals.
 */

// The platform.kind vocabulary, shared by every content-scope consumer so the
// raw 'gitlab'/'github' strings live in exactly one place.
const PLATFORM_KIND = {
    GITLAB: 'gitlab',
    GITHUB: 'github'
};

// Ordered most-specific first, and the last one is a catch-all: content scripts
// run only on gitlab.com and on the hosts the user added from the popup
// (FEAT-0033), so anything that is not github.com is a GitLab — an internal
// instance need not carry the word 'gitlab' in its name.
const PLATFORM_MATCHERS = [
    { kind: PLATFORM_KIND.GITHUB, matches: (loc) => loc.hostname === 'github.com' },
    { kind: PLATFORM_KIND.GITLAB, matches: () => true }
];

function detectPlatformKind(location = window.location) {
    return PLATFORM_MATCHERS.find((m) => m.matches(location)).kind;
}

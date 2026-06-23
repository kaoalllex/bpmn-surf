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

// Ordered most-specific first: github.com wins before the loose gitlab
// substring (a github.com URL with 'gitlab' in the path must read 'github').
const PLATFORM_MATCHERS = [
    { kind: PLATFORM_KIND.GITHUB, matches: (loc) => loc.hostname === 'github.com' },
    { kind: PLATFORM_KIND.GITLAB, matches: (loc) => loc.href.includes('gitlab') }
];

function detectPlatformKind(location = window.location) {
    const matcher = PLATFORM_MATCHERS.find((m) => m.matches(location));
    return matcher ? matcher.kind : null;
}

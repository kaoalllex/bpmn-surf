#!/usr/bin/env bash
#
# Package the runtime files into a distributable zip for the Releases page.
#
# There is no build step (the extension is loaded unpacked), so the zip is just
# the runtime subset — manifest + src + libs + icons — excluding everything that
# is dev-only (docs/, test/, scripts/, node_modules/, venv/, package*.json, ...).
# The file set must mirror what manifest.json references.
#
# Hosts for an internal build (GitLab instances) are passed as arguments and
# baked into the staged manifest's host_permissions only — they are never written
# to the tracked manifest.json. A required host is among the granted origins, so
# the service worker registers the content scripts there with no popup step:
#
#     npm run package                        # public build (no site built in)
#     npm run package -- gitlab.internal.example
#
# `--store` builds the Chrome Web Store upload instead: the store wants
# manifest.json at the zip root, while the default zip wraps everything in a
# bpmn-surf/ folder that unpacks ready for "Load unpacked". A store build is
# always public, so it takes no extra hosts:
#
#     npm run package -- --store
#
# The store zip is also the Microsoft Edge Add-ons upload, unchanged.
#
# `--firefox` builds the addons.mozilla.org upload: the store layout with the
# staged manifest rewritten for Firefox (scripts/firefox-manifest.js), so the
# tracked manifest.json stays the single source:
#
#     npm run package -- --firefox
#
# Requires the system `zip`. Output: dist/bpmn-surf-<version>.zip,
# dist/bpmn-surf-<version>-store.zip with --store,
# dist/bpmn-surf-<version>-firefox.zip with --firefox
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [ -z "$version" ]; then
    echo "package: could not read version from manifest.json" >&2
    exit 1
fi

store=false
firefox=false
if [ "${1:-}" = "--store" ] || [ "${1:-}" = "--firefox" ]; then
    store=true
    [ "$1" = "--firefox" ] && firefox=true
    shift
    if [ "$#" -gt 0 ]; then
        echo "package: a store build is public, it takes no hosts: $*" >&2
        exit 1
    fi
fi

name="bpmn-surf"
stage="dist/$name"
zip_name="$name-$version.zip"
if [ "$firefox" = true ]; then
    zip_name="$name-$version-firefox.zip"
elif [ "$store" = true ]; then
    zip_name="$name-$version-store.zip"
fi

rm -rf "$stage" "dist/$zip_name"
mkdir -p "$stage/icons"

cp manifest.json "$stage/"

# Staged copy only — the tracked manifest stays public.
if [ "$#" -gt 0 ]; then
    node -e '
        const fs = require("fs");
        const [file, ...hosts] = process.argv.slice(1);
        const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
        const granted = manifest.host_permissions = manifest.host_permissions || [];
        for (const host of hosts) {
            const pattern = `https://${host}/*`;
            if (!granted.includes(pattern)) granted.push(pattern);
        }
        fs.writeFileSync(file, JSON.stringify(manifest, null, 4));
    ' "$stage/manifest.json" "$@"
    echo "package: baked hosts into host_permissions: $*"
fi

if [ "$firefox" = true ]; then
    node scripts/firefox-manifest.js "$stage/manifest.json"
fi
cp -R src "$stage/"
cp -R libs "$stage/"
cp icons/*.png "$stage/icons/"

if [ "$store" = true ]; then
    ( cd "$stage" && zip -rq "../$zip_name" . -x '*.DS_Store' )
else
    ( cd dist && zip -rq "$zip_name" "$name" -x '*.DS_Store' )
fi
rm -rf "$stage"

echo "Packaged dist/$zip_name"

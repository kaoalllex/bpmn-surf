#!/usr/bin/env bash
#
# Package the runtime files into a distributable zip for the Releases page.
#
# There is no build step (the extension is loaded unpacked), so the zip is just
# the runtime subset — manifest + src + libs + icons — excluding everything that
# is dev-only (docs/, test/, scripts/, node_modules/, venv/, package*.json, ...).
# The file set must mirror what manifest.json references.
#
# Requires the system `zip`. Output: dist/bpmn-surf-<version>.zip
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
if [ -z "$version" ]; then
    echo "package: could not read version from manifest.json" >&2
    exit 1
fi

name="bpmn-surf"
stage="dist/$name"

rm -rf dist
mkdir -p "$stage/icons"

cp manifest.json "$stage/"
cp -R src "$stage/"
cp -R libs "$stage/"
cp icons/*.png "$stage/icons/"

( cd dist && zip -rq "$name-$version.zip" "$name" -x '*.DS_Store' )
rm -rf "$stage"

echo "Packaged dist/$name-$version.zip"

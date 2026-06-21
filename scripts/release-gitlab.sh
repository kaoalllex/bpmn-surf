#!/usr/bin/env bash
#
# Publish a GitLab release for the current version and attach the runtime zip.
#
# This is the final step of a release, run AFTER the version bump produced by the
# `release` skill is on master (manifest.json / version.json / CHANGELOG.md).
#
# Flow:
#   1. Build dist/bpmn-surf-<version>.zip via package.sh
#   2. Create a GitLab release tagged v<version> on the Releases page, attaching
#      the zip as a downloadable asset, with notes taken from the matching
#      CHANGELOG.md section.
#
# The git tag is created server-side from --ref (default: master) via the API,
# so no push into the protected master branch is needed.
#
# Requires: glab (authenticated against the project's GitLab), zip.
# Usage: scripts/release-gitlab.sh [ref]
#   ref — commit SHA / branch / tag to tag the release from (default: master)
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# --- preconditions ---
command -v glab >/dev/null 2>&1 || { echo "release: glab is not installed (brew install glab)" >&2; exit 1; }
glab auth status >/dev/null 2>&1 || { echo "release: glab is not authenticated (run: glab auth login)" >&2; exit 1; }

version="$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
[ -n "$version" ] || { echo "release: could not read version from manifest.json" >&2; exit 1; }

name="bpmn-surf"
tag="v$version"
ref="${1:-master}"
zip="dist/$name-$version.zip"

# --- guard: release already exists ---
if glab release view "$tag" >/dev/null 2>&1; then
    echo "release: $tag already exists on GitLab — bump the version (the release skill) first" >&2
    exit 1
fi

# --- release notes from the matching CHANGELOG.md section (blank ends trimmed) ---
notes="$(awk -v hdr="## $version" '
    $0 == hdr { p = 1; next }
    p && /^## / { exit }
    p { buf = buf $0 "\n" }
    END { sub(/^\n+/, "", buf); sub(/\n+$/, "", buf); printf "%s", buf }
' CHANGELOG.md)"
[ -n "$notes" ] || notes="bpmn-surf $version."
readme_install="https://gitlab.example.com/kaoalllex/bpmn-diff/-/blob/master/README.md?ref_type=heads#installation"
notes="$notes

---
**Install:** see the [Installation section of the README]($readme_install)."

# --- build the artifact ---
echo "release: building $zip ..."
"$repo_root/scripts/package.sh"
[ -f "$zip" ] || { echo "release: expected $zip was not produced" >&2; exit 1; }

# --- publish ---
echo "release: creating GitLab release $tag from '$ref' ..."
glab release create "$tag" \
    "$zip#$name $version (unpacked extension)#other" \
    --ref "$ref" \
    --name "$name $version" \
    --tag-message "$name $version" \
    --notes "$notes"

# Fetch the freshly created tag locally (best-effort).
git fetch --tags origin >/dev/null 2>&1 || true

echo "release: published $tag"

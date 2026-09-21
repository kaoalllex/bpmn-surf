---
description: Prepare a release — bump the version in manifest.json and commit
argument-hint: [major|minor|patch] (default minor)
allowed-tools: Read, Edit, Bash(git *)
---

Prepare an extension release:

1. Read the current version from `manifest.json` (format `0.MINOR.PATCH`)
2. Bump the version according to the `$ARGUMENTS` argument (default minor: 0.18.0 → 0.19.0)
3. This is the only permitted case for editing `manifest.json` — change ONLY the `version` field
4. Show `git log --oneline` since the last version change (`git log -p --follow manifest.json | grep -n version` or `git log --oneline -15`) and compose a short changelog
5. Add an entry to the top of `CHANGELOG.md`: a `## X.Y.Z` section with the changelog items (it becomes the GitHub release notes)
6. Show the change and propose a commit like `release: vX.Y.Z` — commit only after confirmation
7. Commit per `docs/git-workflow.md`: not into master, but into a separate branch with a follow-up MR

Respond in the language the user opened the conversation with.

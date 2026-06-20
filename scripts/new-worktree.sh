#!/usr/bin/env bash
#
# Create a fresh git worktree for an independent task, so a separate Claude Code
# (or human) session can work in parallel without colliding with other sessions.
#
# Usage:
#   scripts/new-worktree.sh <task-slug> [type]
#
#   <task-slug>  kebab-case task name, e.g. dmn-export-button
#   [type]       branch type: feature (default) or fix
#
# The new branch is based on a freshly fetched origin/master, the worktree is
# placed next to the repo as ../bpmn-diff-<task-slug>, and dependencies are
# installed there (node_modules are not shared between worktrees).
#
# Per docs/git-workflow.md this is a pre-session step run by a human, not by
# Claude from inside a session.

set -euo pipefail

task="${1:-}"
type="${2:-feature}"

if [[ -z "$task" ]]; then
  echo "usage: scripts/new-worktree.sh <task-slug> [feature|fix]" >&2
  exit 1
fi

if [[ "$type" != "feature" && "$type" != "fix" ]]; then
  echo "error: type must be 'feature' or 'fix' (got '$type')" >&2
  exit 1
fi

# Resolve repo root so the script works regardless of the current directory.
repo_root="$(git rev-parse --show-toplevel)"
parent_dir="$(dirname "$repo_root")"
worktree_dir="$parent_dir/bpmn-diff-$task"
branch="$type/$task"

if [[ -e "$worktree_dir" ]]; then
  echo "error: $worktree_dir already exists" >&2
  exit 1
fi

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "error: branch '$branch' already exists" >&2
  exit 1
fi

echo "==> fetching origin"
git -C "$repo_root" fetch origin

echo "==> creating worktree $worktree_dir on branch $branch (from origin/master)"
git -C "$repo_root" worktree add "$worktree_dir" -b "$branch" origin/master

echo "==> installing dependencies"
( cd "$worktree_dir" && npm install )

echo
echo "Done. Start a session there with:"
echo "    cd \"$worktree_dir\" && claude"

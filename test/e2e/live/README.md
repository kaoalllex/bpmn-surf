# Live harness

Scripts that drive the **real extension in a real browser**, against the live test
sandbox (`gitlab.com/kao.alllex/bpmn-surf-test`). They exist because the bugs that
keep recurring — the diff button appearing for the wrong file, blinking, or not at
all — live in GitLab's markup and in timing, and neither survives being reasoned
about from a transcript.

They are **not tests**. `npm test` ignores them (they are not `*.test.js`) and so
does `playwright test` (not `*.spec.js`). Nothing here runs in CI: they talk to
gitlab.com, so they are as available as it is.

| Script | What it answers |
|--------|-----------------|
| `mr-button.mjs <iid> [--legacy] [--parallel] [--walk] [--click] [--shots <dir>]` | Does every rendered diagram block carry exactly one button, for its own file, with the right label, and none on other files? No churn while idle. `--legacy` = the legacy diffs UI (what self-managed serves), `--parallel` = side-by-side, `--walk` = click every file in the tree and check that no button is visible while rapid diffs greys out the previous file, `--click` = the differ tab opens, `--shots` = header screenshots |
| `branch-button.mjs <ref> <path> [--shots <dir>]` | The blob-view split button: placement beside GitLab's button groups, the main button and the "Diff with local file…" menu both open the differ, Escape closes the menu |
| `file-selection.mjs [iid]` | What GitLab does to the URL when a file is picked — the measurement behind [REFAC-0016] |
| `capture-login.mjs` | One-time sign-in, so the others run as you instead of anonymously |
| `diff-mode.mjs [on\|off]` | Reads, and on request sets, the account's "Show one file at a time" preference |
| `popup-screens.mjs [dir]` | Renders every popup screen, reports height and overflow, saves screenshots. Needs no network |

## Signing in

The sandbox is public, so most of this works anonymously. One thing does not:
**"Show one file at a time"** is a per-user preference, and the two diff modes are
different enough that a bug in one says nothing about the other.

```
node test/e2e/live/capture-login.mjs
```

A browser window opens; sign in — **ticking "Remember me"**. Nothing to press
afterwards: it polls `/api/v4/user`, then reopens the closed profile to prove the
login survived, and fails loudly if it did not. Re-running it when the profile is
already signed in does nothing.

The tick matters because `_gitlab_session` is a session cookie: Chromium holds it
in memory and drops it on exit, so a profile logged in without "Remember me" is
signed out again by the next script. "Remember me" adds a persistent
`remember_user_token`, which is what survives.

The login stays in the browser profile at `~/.config/bpmn-surf-browser-profile`,
which every script here reuses, and **nothing is exported**. That is deliberate:
GitLab rotates its session cookie on use, so a saved `storageState` copy is dead
within minutes — the first version of this harness did exactly that and spent a
login on finding out.

Treat the profile as the account itself. It never goes near the repository;
`rm -rf` it to sign out, and the harness drops back to anonymous.

Because it is one profile, **run one script at a time** — Chromium locks the
directory.

## Reading the output

Both runners print `RESULT: OK` or the failing checks and exit non-zero on a
failure. `mr-button.mjs` also prints `button insertions/removals over 5s idle`,
which is 0 on a healthy run: anything else means the sync fights the page (the
self-feeding loop of [BUG-0036] showed up as exactly that).

The legacy diffs UI — what self-managed GitLab serves — is available on
gitlab.com too: append `?rapid_diffs_disabled=true` to an MR diffs URL (that is
what `--legacy` does). `?rapid_diffs=false` does *not* switch it.

File blocks are anchored by `sha1(path)` in both UIs (element ids); the
`HandlerLocator#mrFileDiffUrl` deep link relies on it.

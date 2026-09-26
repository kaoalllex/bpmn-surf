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
| `mr-button.mjs [iid]` | Does the button appear for the right file, say the right thing, and stay put? Counts rebuilds and state flips over 10s |
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

`mr-button.mjs` prints the rendered `diff-file` elements with `sha1(path)` beside
each id. They match: that is GitLab's anchor scheme, and [REFAC-0016] and
[BUG-0031] both build on it.

The two numbers at the end are the regression guards. On a healthy run against
MR !2 they are `button state changes over 10s: 0` and `button rebuilds: 1`. Before
[BUG-0036] was fixed the same run gave a flip every two seconds and a rebuild
every 600ms.

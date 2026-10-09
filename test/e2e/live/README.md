# Live harness

Scripts that drive the **real extension in a real browser**, against the live test
sandbox (`gitlab.com/kao.alllex/bpmn-surf-test`) — or, with `BPMN_SURF_PROJECT`, another
project (see [The demo project](#the-demo-project)). They exist because the bugs that
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
| `search-page.mjs [--shots <dir>]` | Does GitLab still serve the "search in the repository" fallback URL that `GitLabPlatformClient#searchPageUrl` builds — 200, scoped to the project, honouring a ref with a slash? Picks its sample file from the sandbox at run time |
| `capture-login.mjs [--github]` | One-time sign-in, so the others run as you instead of anonymously. `--github` signs in to github.com instead of GitLab |
| `diff-mode.mjs [on\|off]` | Reads, and on request sets, the account's "Show one file at a time" preference |
| `record-demo.mjs <iid> <outDir> [--clip <name>,…] [--no-shots] [--no-video]` | Records the README GIFs (one per clip: `hero`, `buttons`, `details`, `subprocess`, `code`, `diagrams`, `search`, `edit`, `local`) and the five store screenshots from the demo project's showcase MR. Each clip is a paced tour with a visible pointer. Every tab records its own video, and ffmpeg (must be on PATH) cuts out and joins the on-screen spans. `--clip` re-records only the named clips (`local` reads the `edit` clip's download). Needs the signed-in profile and "Show one file at a time" on. GitLab's layout cookies are switched for the run and restored. When a clip breaks, every open tab is saved as `failed-<clip>-<n>.png`. `--no-video` walks the same tours without recording (no GIF, no ffmpeg): the live check of the differ's navigation |
| `popup-screens.mjs [dir]` | Renders every popup screen, reports height and overflow, saves screenshots; also submits `github.com` and reports the refusal and that no permission was requested. Needs no network |

## Environment

| Variable | Effect |
|----------|--------|
| `BPMN_SURF_PROJECT=<project URL>` | The project every script opens instead of the sandbox |
| `BPMN_SURF_ANONYMOUS=1` | A throwaway profile instead of the signed-in one: what a visitor without a GitLab account sees. The signed-in profile is not touched |

## The demo project

`https://gitlab.com/kao.alllex/bpmn-surf-demo` (project id `87197312`) is a **frozen
showcase**, not a test bed. Its links are published: the Chrome Web Store reviewer test
instructions, the README GIF and the store/README screenshots all point at it or were
recorded from it. The sandbox stays the mutable place for repros and new test material.

It holds a small Camunda 7 order service:
- `OrderMain.bpmn`: a collapsed subprocess, a call activity into `Payment.bpmn`, and a
  receive task waiting for `OrderPaid`;
- `Payment.bpmn`: a business rule task on `PaymentRisk.dmn` and a call activity into
  `ManualReview.bpmn`;
- `SubscriptionRenewal.bpmn`: a second caller of `Payment.bpmn`, so the dive-out menu lists
  two callers;
- Kotlin `@ExternalTaskSubscription` handlers and a Kafka listener correlating `OrderPaid`.

One merge request, **"Express checkout and stricter payment risk"** (branch
`feature/express-checkout`), stays open forever. It changes every diff kind the extension
shows:
- an added, a removed and a changed task, and a task whose type changed;
- a multi-line sequence-flow condition, where one line is added and one changed;
- a step inside the collapsed subprocess;
- property groups (inputs/outputs);
- handlers, one of them behind a dive-in (`Payment.bpmn` → `ChargeCustomerHandler.kt`);
- a DMN cell and rule.

**Allowed:** reading it, read-only live scripts (button checks, opening the differ), and
recording media.

**Forbidden:** merging or closing the showcase MR, new branches or MRs, bug repros (use the
sandbox), changing visibility or settings, deleting anything. Any content change happens
only on the owner's explicit request, through the API, and is followed by re-recording the
media (`record-demo.mjs`) and re-checking the reviewer instructions signed out
(`BPMN_SURF_ANONYMOUS=1`).

After a re-recording, copy the GIFs into `docs/media/` under the same names. The README's
`popup.png` is the Sites and annotations screens of `popup-screens.mjs`, cropped and set side
by side. The five 1280×800 screenshots are the store's. Store assets, including the promo
tile and its own small diagram, are kept with the owner's store notes, not in this repository.

The project access token (`~/.config/bpmn-surf-demo-token`, Maintainer, scope `api`) is
only for content changes the owner asked for.

Scripts and docs resolve the MR by its title at run time. Only published text (the root
README, the store reviewer instructions) carries its URL, and the iid in it is frozen with
the project. The project is public, so reading needs no token:

```bash
B=https://gitlab.com/api/v4/projects/87197312
IID=$(curl -s "$B/merge_requests?state=opened&in=title&search=Express%20checkout" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["iid"])')
export BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo
node test/e2e/live/mr-button.mjs $IID
```

The first file of the MR is a Kotlin handler, so in "Show one file at a time" mode
`mr-button.mjs` sees no diagram. Switch the mode off with `diff-mode.mjs off` for the run,
then set it back.

Signed out, these work: the diff, the blob view, the call-activity dive-in and a changed
handler's MR diff. Anything that needs the code search API, which gitlab.com answers only
for a signed-in user, does not. Signed out:
- an unchanged handler and the decision badge open GitLab's web search page;
- correlation shows "Could not pinpoint a correlation point.";
- the callers menu says "Couldn't check the calling diagrams."

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

`node test/e2e/live/capture-login.mjs --github` does the same for github.com in the same
profile (the GitHub sandbox is checked signed in as well as anonymous). The sign-in page is `github.com/login`; the script polls the page's
`user-login` meta tag. GitHub's `user_session` is persistent, so there is no "Remember
me" to tick; the closed-profile check still runs.

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

File blocks are anchored by `sha1(path)` in both UIs (element ids). The
`GitLabPlatformClient#prFileDiffUrl` deep link is `diffs?file_path=<path>#<sha1(path)>`,
the same as GitLab's own file-tree links. With "Show one file at a time" on, rapid
diffs ignores a bare anchor, even on a fresh load, and picks the file only from
`file_path`.

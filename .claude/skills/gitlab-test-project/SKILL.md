---
name: gitlab-test-project
description: Coordinates and lookup recipes for the live GitLab sandbox where the human manually tests the extension (gitlab.com/kao.alllex/bpmn-surf-test), and the rules of the frozen showcase project gitlab.com/kao.alllex/bpmn-surf-demo (store reviewer instructions, README GIF, screenshots). Use whenever a report references the test GitLab project, a test MR, or a diagram in it — "in the test GitLab project", "there is a bug in diagram X", "test MR", "the test sandbox", "the demo project", "bpmn-surf-demo", the showcase MR, or a gitlab.com/kao.alllex/... URL. Tells you what to fetch and how to turn the report into a local repro. Do NOT use for the extension's own repo or for gitlab.example.com.
---

# Test GitLab sandbox

The owner's machine keeps a `local.md` beside this file (not in git): where the store
texts and the sandbox and demo content generators live. Read it when a task touches
those; without it, work from the API alone.

`https://gitlab.com/kao.alllex/bpmn-surf-test` (project id `86738512`), where the
human loads the unpacked extension and clicks through real MRs. It is **public**:
reads work anonymously, but blob search answers 401 without a session, and writes
need the token — so use the token on every call.

```bash
T=$(cat <sandbox token file>)   # Maintainer, scope `api`; the file is named in local.md
B=https://gitlab.com/api/v4/projects/86738512
H="PRIVATE-TOKEN: $T"
curl -s -H "$H" "$B/repository/tree?recursive=true&ref=main&per_page=100"
curl -s -H "$H" "$B/repository/branches"
curl -s -H "$H" "$B/merge_requests?state=all"              # MRs + their diff_refs
curl -s -H "$H" "$B/merge_requests/<iid>/changes"           # what the MR touches
curl -s -H "$H" "$B/repository/files/<path>/raw?ref=<sha|branch>"
curl -s -H "$H" "$B/search?scope=blobs&search=<term>&ref=main"
```

If a token file (this one or the demo one below) is missing, ask the human to recreate it (project → Settings →
Access tokens, role Maintainer, scope `api`) rather than working around it. Have them
copy the new token and run `pbpaste > <token-file>; chmod 600 <token-file>` — never hand
over a command with the token inline: a `!` command lands in the session transcript.

The token also **writes**: `POST /repository/commits` with `actions[]`,
`POST /merge_requests`, `PUT /merge_requests/:iid/merge`. New test material goes in
through the API — no clone, no push.

## Resolve, never assume

The sandbox is the human's scratch space: they add, rename and delete diagrams,
branches and MRs as they test. **Nothing about its contents is stable** — list the
tree / branches / MRs on every use and match against what the report names. Do not
carry over file names, branch names or MR iids from an earlier session, from this
file, or from the conversation history; a stale iid silently points at the wrong
diff and the diagnosis goes with it.

If the report does not say which MR (or branch) it happened on, list the MRs and
ask — do not pick one. Skip the question only when the report names a diagram that
exists in exactly one of them.

A merged MR carries `merge_commit_sha` / `squash_commit_sha`, which is the input to
`MergedMrCommitResolver`; an open one exercises the plain path. Which MRs are of
which kind — read from the listing, not from here.

## What the sandbox is built to exercise

Two modules mirror the two ways Camunda is wired up in real projects:
`order-service/` uses **external tasks** (`camunda:topic` + `@ExternalTaskSubscription`
handlers in Kotlin and Java), `billing-service/` uses
**classic delegates** (`camunda:class` and `camunda:delegateExpression` + Java
`JavaDelegate`s). `broken/` holds a diagram truncated mid-text-node; `legacy/` an
oversized one.

Deliberate traps live there: the topic `findItems` is a prefix of
`findItemsInCatalog` and `chargeCustomer` of `chargeCustomerWithRetry` (BUG-0027,
in Kotlin and in Java); `RefundDelegate` exists in two packages;
`${billingService.settle(execution)}` yields no handler key; the
`migrationStep01…30` topics have no code at all.

`order-service-c8/` is the **Camunda 8 (Zeebe)** twin (FEAT-0038): `zeebe:taskDefinition`
job types, `zeebe:calledElement` / `zeebe:calledDecision`, I/O mappings, headers, a Camunda
user task with a form, FEEL conditions, Kotlin/Java `@JobWorker` workers. Every id a search
keys on (process, decision, message) carries a `C8` suffix, so the two modules never answer
each other's searches. Its traps: `find-items` / `find-items-in-catalog` and
`charge-customer` / `charge-customer-with-retry` (kebab-case prefixes), `@JobWorker` with no
`type` (`screenFraud`, `packItem` — the method name is the type), `type` not the first
argument (`reserve-stock`), a multi-line annotation (`find-items-in-catalog`), the deprecated
`@ZeebeWorker` (`escalate-delivery`), no worker (`archive-delivery`), an HTTP connector
(`io.camunda:http-json:1`), a job type on a message throw event, `DunningC8` called but not
defined. Its C8 branches (`c8/model-changes`, `c8/worker-code`, `c8/migrate-payment` — the
C7 `Payment.bpmn` migrated in place) are mirrored on GitHub. Its generator is kept on the
owner's machine (`local.md`).

`order/listeners/ListenerShowcase.bpmn` (C7) and its C8 twin `ListenerShowcaseC8.bpmn`
carry every listener event: process listeners (on the start event), several start
listeners on one task, a `take` on a flow, a user task with every task-listener event
(C7 `timeout` included), an expression-only listener (no badge). They reuse the existing
listener classes / the `audit-step` worker; `audit-order-step` has no worker.

Two MRs stay open as live-check material (find them by branch): `test/many-handlers`
adds handlers for `migrationStep01…20`, so `legacy/LegacyMigration.bpmn` opened from it
carries 18 permanent badges (crowding at the fitted zoom) while `main` keeps the topics
without code; `test/large-dmn` holds the wide, long decision table `dmn-layout.mjs` walks.

**Blob search works here** for a member (the token, or the signed-in harness
profile), so handler badges and correlation navigation ARE reachable — signed
out, they are not.

## From report to repro

Pull both versions of the diagram (`diff_refs.base_sha` and `head_sha`) into the
scratchpad, then reproduce **headlessly** instead of asking the human to click
again: feed the pair to `BpmnXmlComparator` via the `#scope` harness, or drop it
into `test/e2e/fixtures/` and drive the real differ (`docs/testing.md`). A repro
that fails locally is the handoff point to the `fix` skill.

---

# ⚠️ The demo project — a frozen showcase, NOT the sandbox

`https://gitlab.com/kao.alllex/bpmn-surf-demo` (project id `87197312`). Its links are
**published**: the Chrome Web Store reviewer test instructions, the README GIF and the
store/README screenshots were made from it.
A change here silently breaks all three. Bugs, repros and new test material go to the
sandbox above, never here. The same holds for its GitHub copy,
`https://github.com/kaoalllex/bpmn-surf-demo` (pull request #1), linked from the README.

```bash
T=$(cat <demo token file>)   # project access token, Maintainer, scope `api`; named in local.md
B=https://gitlab.com/api/v4/projects/87197312
H="PRIVATE-TOKEN: $T"
curl -s -H "$H" "$B/merge_requests?state=opened"           # the showcase MR
curl -s -H "$H" "$B/repository/tree?recursive=true&ref=main&per_page=100"
```

**Contents:** a small Camunda 7 order service:
- `order-service/src/main/resources/bpmn/OrderMain.bpmn`: the collapsed subprocess "Reserve
  stock", the call activity "Payment", and the receive task waiting for `OrderPaid`;
- `Payment.bpmn`: business rule task → `dmn/PaymentRisk.dmn`, call activity →
  `ManualReview.bpmn`;
- `SubscriptionRenewal.bpmn`: a second caller of Payment;
- Kotlin `@ExternalTaskSubscription` handlers and `PaymentEventsListener.kt`
  (`createMessageCorrelation("OrderPaid")`).

One MR stays **open forever**: **"Express checkout and stricter payment risk"** (branch
`feature/express-checkout`). It shows:
- added, removed and changed tasks, and a type change ("Cancel the order" → user task);
- a multi-line condition with an added and a changed line;
- a change inside the collapsed subprocess;
- property-group changes;
- changed handlers, including one behind a dive-in (Payment → `ChargeCustomerHandler.kt`);
- a DMN cell and rule change.

Find it **by title** at run time; never hardcode its iid. The reviewer instructions and the
README are the only places the MR URL is written out, because they are published text.

**Allowed:** reading through the API or the UI, read-only live scripts
(`BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo`: `mr-button.mjs`,
`branch-button.mjs`, opening the differ), signed-out checks (`BPMN_SURF_ANONYMOUS=1`),
and recording media with `test/e2e/live/record-demo.mjs`.

**Forbidden:** merging or closing the showcase MR; new branches or MRs; bug repros;
changing visibility, features or any setting; deleting anything. A content change
happens **only on the human's explicit request**, through the API
(`POST /repository/commits`). It is followed by re-recording the media
(`record-demo.mjs`), re-checking the reviewer instructions signed out, and updating them
if anything they name moved.

The generator of the current content is kept on the owner's machine, not in git
(`local.md`). Fetching the files from the API works too.

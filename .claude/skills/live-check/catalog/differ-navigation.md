# Differ navigation (signed in)

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

Dive-in, the callers list, the decision badge, handler and correlation badges use
GitLab code search, which answers only a signed-in session — so a change to
navigation or to the platform client's search gets a live run on top of Layer-2.
The demo tours cover all of it; walk them without recording, into the scratchpad:

```bash
T=$(cat ~/.config/bpmn-surf-demo-token)   # resolve the showcase MR by title
BPMN_SURF_PROJECT=https://gitlab.com/kao.alllex/bpmn-surf-demo \
  node test/e2e/live/record-demo.mjs <iid> <scratchpad>/demo --no-video
```

| The runner asserts | You check in the screenshots |
|---|---|
| every tour reaches its tabs (`<clip>: OK`); a broken one leaves `failed-<clip>-<n>.png` | `3-callers.png` lists both callers; BPMN icons render; DMN cells coloured |

This is a check, not a re-recording: the README and store media change only on
the human's request (`gitlab-test-project`, "The demo project").

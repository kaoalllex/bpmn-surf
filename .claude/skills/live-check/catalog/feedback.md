# Report a problem (💬)

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

What the button puts into the report (the prefilled title and body, the branch-only and
local-file shapes, the error badge, no diagram XML) is Layer 2: `differ-feedback.spec.js`
and `differ-feedback-no-schema.spec.js`. Only github.com accepting that prefilled URL is
run-time — a URL too long or a renamed query parameter would open an empty form.

| Command | Expect |
|---|---|
| `badges.mjs main order-service/src/main/resources/bpmn/order/OrderMain.bpmn -:feedback` and the same on `order-service/src/main/resources/dmn/payment/FeeSchedule.dmn` | `…/kaoalllex/bpmn-surf/issues/new  title: "[differ] <file>"  body: <n> chars, xml: false` — the form is filled; `no field` for either means github.com changed its form (or the profile is signed out of github.com: `capture-login.mjs --github`) |

Do not submit the form: the issues are the project's real tracker.

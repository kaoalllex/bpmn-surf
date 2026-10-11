# Camunda 8 (FEAT-0038)

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

Material: the sandboxes' `order-service-c8/` module and its three MR / PR pairs
(`c8/model-changes`, `c8/worker-code`, `c8/migrate-payment` — resolve the numbers by
branch, see `docs/testing.md`). Signed in on both platforms; badge rows run with
`test/e2e/live/badges.mjs`, the rest by hand or with `launchWithExtension()`, screenshots
into the scratchpad.

| Scenario | Expect |
|---|---|
| `c8/model-changes`, every changed diagram, both UIs (`mr-button.mjs <iid> --click`, then open each diagram) | every differ opens with the Zeebe panel and no console error. What the panel paints per change kind, the FEEL split, the subprocess outline and the edit-mode download are Layer 2 on fixtures cut from this MR (`differ-c8-prop-groups`, `-condition`, `-edit`): re-cut them when the MR changes |
| `c8/migrate-payment` | opens with no console error (both sides highlighted, the Zeebe panel on the C8 side: Layer 2, `differ-c8-migration`) |
| `main` of the C8 module: OrderMain → Payment → `PaymentC8`, AssessRisk → `PaymentRiskC8.dmn` | dive-in opens the right file |
| dive-out from Delivery, from `PaymentRiskC8.dmn` | the callers list holds Fulfillment / Payment; the caller opens with its call site selected |
| Payment → Dunning (`DunningC8`, defined nowhere) | the code-search page |
| badges on the C8 module | on every task with a worker — incl. `screenFraud` / `packItem` (method name), `reserve-stock` (type not first), `find-items-in-catalog` (multi-line) and the Java ones; `find-items` and `charge-customer` open their own workers; `archive-delivery` opens the code-search page; the HTTP connector has none; `escalate-delivery` opens its worker even without `ZeebeWorker` configured (no annotated hit → the unannotated one, as for C7) |
| listener badge (FEAT-0019): `c8/model-changes`, `OrderMain.bpmn`, select "Validate the order" | a neutral `ℓ</>` row off the bottom-left corner beside the task's `</>` off the bottom-right one; titled "Execution listener (start) — open the handler code"; the click opens the code search for `audit-order-step` (no worker of that type) |
| `c8/worker-code` | worker code only, no diagram, so no differ opens from it; the keys of its two workers are unit-tested (`handler-locator.test.js`, "the sandbox c8/worker-code workers") and the "changed handler" badge is Layer 2 — re-check here only that the MR still changes those two files |
| a C7 topic equal to a C8 method name (`findItems` vs `fun findItems` under `type = "find-items"`) | the C7 badge opens the C7 handler, not the C8 worker |
| correlation: `badges.mjs main order-service-c8/src/main/resources/bpmn/order/OrderMain.bpmn AwaitPayment:correlation` | `OrderPaidC8` → a menu with `PaymentEventsListener.kt:16` (and the README line naming it); no C7 `OrderEventsListener.kt` — the C8 half of the message isolation (the C7 half: `differ-navigation.md`) |
| GitHub: `BPMN_SURF_PROJECT=https://github.com/kaoalllex/bpmn-surf-test badges.mjs main order-service-c8/src/main/resources/bpmn/order/OrderMain.bpmn ValidateOrder ValidateOrder:listener AwaitPayment:correlation Payment:dive-in`, then `badges.mjs --open 1 main order-service-c8/src/main/resources/bpmn/order/payment/Payment.bpmn StartPayment:callers` | signed in to GitHub: the worker `ValidateOrderWorker.kt`, the listener's `AuditWorker.kt`, the same correlation menu, dive-in to `payment/Payment.bpmn`; callers → `OrderMain.bpmn`, opened with `Payment` selected |
| any C7 MR of the sandbox | exactly as before: the Camunda 7 panel, C7 badges and dive-in on `order-service/` |

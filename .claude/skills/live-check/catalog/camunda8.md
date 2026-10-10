# Camunda 8 (FEAT-0038)

Part of the `live-check` skill catalog; the prerequisites and rules are in its `SKILL.md`.

Material: the sandboxes' `order-service-c8/` module and its three MR / PR pairs
(`c8/model-changes`, `c8/worker-code`, `c8/migrate-payment` — resolve the numbers by
branch, see `docs/testing.md`). Signed in on both platforms; drive by hand or with
`launchWithExtension()`, screenshots into the scratchpad.

| Scenario | Expect |
|---|---|
| `c8/model-changes`, every changed diagram | the Zeebe panel (groups "Task definition", "Input mapping"…), a painted group for each change kind, the FEEL condition of `Flow_yes` split into lines, "Prepare the documents" outlined; edit mode on `OrderMain.bpmn`: the panel edits, the download keeps `xmlns:zeebe` |
| `c8/migrate-payment` | opens with no errors, both sides highlighted; the Zeebe panel on the C8 side |
| `main` of the C8 module: OrderMain → Payment → `PaymentC8`, AssessRisk → `PaymentRiskC8.dmn` | dive-in opens the right file |
| dive-out from Delivery, from `PaymentRiskC8.dmn` | the callers list holds Fulfillment / Payment; the caller opens with its call site selected |
| Payment → Dunning (`DunningC8`, defined nowhere) | the code-search page |
| badges on the C8 module | on every task with a worker — incl. `screenFraud` / `packItem` (method name), `reserve-stock` (type not first), `find-items-in-catalog` (multi-line) and the Java ones; `find-items` and `charge-customer` open their own workers; `archive-delivery` opens the code-search page; the HTTP connector has none; `escalate-delivery` opens its worker even without `ZeebeWorker` configured (no annotated hit → the unannotated one, as for C7) |
| `c8/worker-code` | worker code only, no diagram, so no differ opens from it: check that `HandlerLocator.extractHandlerKeys` on its two files at the MR head yields `topic:find-items` / `topic:charge-customer` (the "changed" badge is Layer 2) |
| a C7 topic equal to a C8 method name (`findItems` vs `fun findItems` under `type = "find-items"`) | the C7 badge opens the C7 handler, not the C8 worker |
| any C7 MR of the sandbox | exactly as before: the Camunda 7 panel, C7 badges and dive-in on `order-service/` |

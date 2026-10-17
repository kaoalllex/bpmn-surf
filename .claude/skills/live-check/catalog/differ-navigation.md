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

## The sandbox, Camunda 7

The demo tours cover the happy path; the sandbox's traps (the repository README lists
them) are walked with `badges.mjs`, which prints where each badge leads. Signed in, one
script at a time; `O=order-service/src/main/resources/bpmn/order`.

| Command | Expect |
|---|---|
| `badges.mjs main $O/OrderMain.bpmn ValidateOrder ValidateOrder:listener CheckFraud:listener Flow_om3:listener OrderMainProcess_pool:listener AwaitPayment:correlation Payment:dive-in` | handler → `ValidateOrderHandler.kt`; the task's start+end `AuditListener` are **two** stacked badges, `start </>` over `end </>`, both → `AuditListener.kt`; the expression listener of CheckFraud → `no badge`; `${stepTimer}` on the flow → `StepTimer.kt`; the pool shows the process listener → `AuditListener.kt`; `OrderPaid` → straight to `OrderEventsListener.kt` (no C8 `PaymentEventsListener.kt`, no test or config hit — **the C7 ↔ C8 message isolation**); dive-in → the differ of `payment/Payment.bpmn` |
| `badges.mjs main $O/fulfillment/Fulfillment.bpmn StartFulfillment:listener AwaitShipment:correlation ReserveStock Delivery:dive-in` | the pool-less process listener sits on its start event → `FulfillmentAudit.kt`; `OrderShipped` lives in the constant `Messages.ORDER_SHIPPED`, used from another file: a menu `Messages.kt:6 \| application.yml` (Phase 2 follows a constant only within its own file — `correlation-locator.js`) |
| `badges.mjs --open 1 main $O/fulfillment/Delivery.bpmn PickCourier:listener FindItems FindItemsInCatalog EscalateDelivery StartDelivery:callers` | the task listener → `AssignCourierListener.kt`; `findItems` → `FindItemsHandler.kt`, `findItemsInCatalog` → `FindItemsInCatalogHandler.kt` (the prefix trap); `escalateDelivery` has no `@ExternalTaskSubscription` → the search page; callers → `Fulfillment.bpmn`, opened with `Delivery` selected |
| `badges.mjs main $O/listeners/ListenerShowcase.bpmn OrderReceived:listener CheckStock:listener Flow_2:listener ApproveOrder:listener WaitCooling:listener LogOutcome:listener OrderApproved:listener` | one stacked badge per listener, in document order: `process start`/`process end` on the start event (`AuditListener.kt`, `FulfillmentAudit.kt`); CheckStock's three `start` and one `end`; `take` → `StepTimer.kt`; ApproveOrder's `start`, `create`, `assignment`, `update`, `complete`, `delete`, `timeout`; the expression-only LogOutcome → `no badge` |
| `badges.mjs main billing-service/src/main/resources/bpmn/billing/Billing.bpmn IssueInvoice SettleLedger SendReceipt ChargeCard` | `camunda:class` and `${bean}` delegates open their classes; `${billingService.settle(execution)}` → `no badge` |
| `badges.mjs --open 2 main billing-service/src/main/resources/bpmn/billing/Dunning.bpmn Refund WriteOff AwaitResolution:correlation StartDunning:callers` | `${refundDelegate}` → `delegate/RefundDelegate.java`, the first of the two classes of that name in search order (a documented limitation, unit-pinned); `DunningResolved` → `DunningKafkaListener.java`; callers → `Billing.bpmn \| Payment.bpmn` (across modules), the second opened with `Dunning` selected |
| `badges.mjs main legacy/LegacyMigration.bpmn Step01 Step02` | topics without code → the code-search page |
| `badges.mjs --mr <test/many-handlers> --shots <dir> x legacy/LegacyMigration.bpmn Step01 Step02` | the MR adds handlers for `migrationStep01…20`: both badges `(added)` and → the MR tab, that handler's diff; `LegacyMigration-fitted.png` shows the 18 permanent green badges (steps 7 and 14 are gateways) at the fitted zoom, none covering a shape or another badge |
| `badges.mjs --mr <c7/model-changes> x $O/OrderMain.bpmn ValidateOrder:listener OrderMainProcess_pool:listener Flow_om3:listener` | the changed `AuditListener` badges are permanent and `(changed)`, titled "… changed in this MR — open its diff", and send the MR tab to the file's diff; the unchanged `StepTimer` opens its blob at the MR head |

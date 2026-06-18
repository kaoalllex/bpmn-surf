---
id: FEAT-0018
title: Плашка перехода к хендлеру для message end event
priority: medium
status: done
---

## Постановка

На элементах типа **message end event** (завершающее событие-сообщение) тоже может
быть задана implementation (`camunda:class` / `camunda:delegateExpression` /
external task `camunda:type="external"` + `camunda:topic`). Для них нужно показывать
плашку перехода к коду хендлера — ровно так же, как сейчас это работает для **service
task** (overlay `</>`, см. [FEAT-0003], [FEAT-0004]):

- постоянная цветная плашка, если хендлер затронут в текущем MR (зелёный/синий/красный);
- нейтральная плашка по выделению элемента — для остальных;
- клик открывает diff хендлера в MR (для затронутых) либо код на показанной версии.

## Контекст

### Почему service task работает, а message end event — нет

Implementation-атрибуты в camunda-moddle определены через `camunda:ServiceTaskLike`
и `camunda:ExternalCapable` (`libs/camunda-bpmn-moddle/resources/camunda.json`):

```
ServiceTaskLike  extends [bpmn:ServiceTask, bpmn:BusinessRuleTask, bpmn:SendTask, bpmn:MessageEventDefinition]
  → expression, class, delegateExpression, resultVariable
ExternalCapable  extends [camunda:ServiceTaskLike]
  → type, topic
```

Ключевой факт: **`bpmn:MessageEventDefinition` — такой же `ServiceTaskLike`, как и
service task.** То есть набор атрибутов (`class`/`delegateExpression`/`type`/`topic`)
у message-события идентичен service task'у. Разница только в том, **где** они лежат:

- у service task — прямо на `elem.businessObject`;
- у message end event — на **вложенном** `bpmn:MessageEventDefinition`, т.е. на
  `elem.businessObject.eventDefinitions[i]` (где `$type === 'bpmn:MessageEventDefinition'`),
  а не на самом BO события.

Текущий код читает атрибуты только с самого BO и потому для событий возвращает `null`.

### Где правка (точка изменения — одна)

`src/differ/navigation/handler-navigator.js`, приватный метод `#getHandlerKey(elem)`
(строки ~97–114). Сейчас:

```js
#getHandlerKey(elem) {
    const bo = elem && elem.businessObject;
    if (!bo) return null;
    if (bo.type === 'external' && bo.topic) return `topic:${bo.topic}`;
    const delegateExpression = bo.get && bo.get('camunda:delegateExpression');
    if (delegateExpression) return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
    const className = bo.get && bo.get('camunda:class');
    if (className) return HandlerLocator.classKeyFromClassName(className);
    return null;
}
```

Нужно, чтобы атрибуты читались с «носителя implementation»: для service task — сам BO,
для события с `bpmn:MessageEventDefinition` — этот вложенный moddle-объект. Эскиз:

```js
#getHandlerKey(elem) {
    const bo = elem && elem.businessObject;
    if (!bo) return null;
    const impl = HandlerNavigator.#implementationHolder(bo); // BO или его messageEventDefinition
    if (!impl) return null;
    if (impl.type === 'external' && impl.topic) return `topic:${impl.topic}`;
    const delegateExpression = impl.get && impl.get('camunda:delegateExpression');
    if (delegateExpression) return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
    const className = impl.get && impl.get('camunda:class');
    if (className) return HandlerLocator.classKeyFromClassName(className);
    return null;
}

// BO как есть; если у него есть bpmn:MessageEventDefinition — вернуть её.
static #implementationHolder(bo) {
    const defs = bo.eventDefinitions || (bo.get && bo.get('eventDefinitions'));
    const msgDef = defs && defs.find(d => d.$type === 'bpmn:MessageEventDefinition');
    return msgDef || bo;
}
```

`bo.type` / `bo.topic` читаются как plain-свойства (camunda-moddle определяет их под
именами `type`/`topic`); коллизии с `$type` нет — тип элемента у moddle всегда в `$type`.

### Что менять НЕ нужно

- **`handler-locator.js`** — без изменений. `findChangedHandlers`/`resolveLocation`
  работают по строковому ключу (`topic:<topic>` | `class:<Name>`), извлечённому из
  кода хендлеров, и не зависят от типа BPMN-элемента. Как только `#getHandlerKey`
  вернёт правильный ключ для события — и постоянная цветная плашка (матч по
  `#changedHandlers`), и плашка-по-выделению, и клик-навигация заработают «бесплатно».
- **`refreshChangedBadges` / `showOverlayForSelectedElement`** — без изменений
  (они уже обходят все элементы реестра и зовут `#getHandlerKey`).
- **CSS / текст плашки / позиционирование overlay** — те же (`.handler-link`,
  `position: { bottom: 0, right: 0 }`).

### Корнер-кейсы (учесть и/или проверить)

1. **Implementation на вложенной `messageEventDefinition`, а не на BO** — основная
   причина задачи; решается `#implementationHolder`.
2. **Несколько `eventDefinitions`** — выбирать именно `bpmn:MessageEventDefinition`
   по `$type` (а не `[0]`); прочие типы (timer/signal/error/escalation/conditional)
   не несут class/delegate и должны давать `null`.
3. **`camunda:expression`** (например `${bean.method()}`) намеренно НЕ обрабатываем —
   паритет с service task (это вызов метода, не класс). Не добавлять.
4. **External task на событии**: `camunda:type="external"` + `camunda:topic` лежат на
   `messageEventDefinition` — та же ветка `impl.type === 'external'`.
5. **Нормализация / резолв** (`classKeyFromClassName`, `classKeyFromDelegateExpression`,
   `simpleClassName`, отклонение сложных делегат-выражений, коллизии простых имён,
   скан удалённого хендлера на target-ref) — переиспользуются как есть, ничего не дублировать.
6. **Визуальная проверка**: end event — маленький кружок; убедиться, что overlay `</>`
   в правом-нижнем углу читается и не перекрывает маркер diff'а.

### Scope (решено — расширенный)

Обрабатываем **любое событие с `bpmn:MessageEventDefinition`, несущей implementation**,
а не только буквально message **end** event. Тот же moddle-носитель применим к
**message intermediate throw event** (структурно идентичен end event), и подход
`#implementationHolder` + гейт по наличию атрибута (а не по подтипу события) покрывает
оба одной строкой без доп. риска: message start/catch/boundary события не имеют этих
атрибутов и дадут `null`. Фильтр по `bo.$type === 'bpmn:EndEvent'` НЕ добавляем.

### Полное семейство носителей implementation (camunda-moddle)

Атрибуты `class`/`delegateExpression`/`expression` + external `type`/`topic` определены
ровно у одного семейства — `camunda:ServiceTaskLike` (+ `camunda:ExternalCapable`):

| Элемент | Носитель | Статус |
|---|---|---|
| `bpmn:ServiceTask` | сам BO | работает |
| `bpmn:SendTask` | сам BO | **уже работает** текущим `#getHandlerKey` (атрибуты на BO, без вложенности) |
| `bpmn:BusinessRuleTask` | сам BO | так же работает; `camunda:decisionRef` у него — это DMN ([FEAT-0005]), не код-хендлер |
| `bpmn:MessageEventDefinition` | вложенная def внутри события | **эта задача** — хост: message **end event** + message **intermediate throw event** |

Send task и business rule task правки не требуют (атрибуты прямо на BO). Поэтому
доработка нужна только для событий — единственного случая с вложенным носителем.
По возможности добавить регресс-тесты и на send/business-rule task, раз они формально
в том же семействе и сейчас непокрыты.

> Вне scope (ссылаются на код, но другой механизм/UX — отдельные задачи при
> необходимости): `camunda:ExecutionListener`/`camunda:TaskListener`
> (`class`/`delegateExpression`/`expression`/`script` через `extensionElements`,
> много-на-элемент), `camunda:Connector` (`connectorId`), `camunda:Field`.
> Не хендлеры вовсе: `bpmn:ScriptTask`/`Script` (скрипт), `FormProperty`/`FormField`
> (формы), `ErrorEventDefinition.expression` (код ошибки).

### Тесты

Сейчас `#getHandlerKey` приватный и не покрыт тестами (есть только
`test/differ/navigation/handler-locator.test.js` на статические методы локатора).
Чтобы соблюсти стиль проекта (много мелких тестов на публичный API, точная локализация
поломки), извлечь деривацию ключа в **чистую тестируемую функцию** (напр.
`HandlerLocator.handlerKeyFromBusinessObject(bo)` либо отдельный статический хелпер),
принимающую BO-подобный объект, и протестировать на plain-моках moddle:

- service task с `camunda:class` → `class:<Name>` (регресс, не сломали);
- service task external (`type/topic`) → `topic:<topic>` (регресс);
- message end event с `messageEventDefinition.camunda:class` → `class:<Name>`;
- message end event с `delegateExpression` → `class:<Bean>`;
- message end event external → `topic:<topic>`;
- message end event без implementation → `null`;
- end event с timer/signal-definition (не message) → `null`;
- событие без `eventDefinitions` → `null`.

### Связи

- [FEAT-0003] — namespaced-ключ хендлера и цветная подсветка по diffType (база).
- [FEAT-0004] — открытие кода хендлера по клику (база).
- [FEAT-0015] — глубокий анализ изменений хендлеров (транзитивные зависимости), смежная.

### Затронутые файлы (ожидаемо)

- `src/differ/navigation/handler-navigator.js` — расширить `#getHandlerKey`
  (+ вынос чистого хелпера деривации ключа).
- возможно `src/differ/navigation/handler-locator.js` — если хелпер деривации ключа
  логичнее разместить рядом со static-методами локатора.
- `test/differ/navigation/*.test.js` — юнит-тесты деривации ключа.

## История работы

<!-- Заполняется при работе над задачей; свежие записи сверху. -->

### 2026-06-18 · claude-opus-4-8 · ветка `feature/feat-0018-handler-badge-message-event`

При проверке на реальном MR всплыл смежный баг: на элементе с внешней подписью
(а у message-событий она есть всегда) постоянная плашка дублировалась — заведён и
исправлен [BUG-0016] на этой же ветке.

### 2026-06-18 · claude-opus-4-8 · ветка `feature/feat-0018-handler-badge-message-event`

Реализован расширенный scope. Деривация ключа хендлера вынесена из приватного
`HandlerNavigator.#getHandlerKey` в чистый статический хелпер
`HandlerLocator.handlerKeyFromBusinessObject(bo)` (+ приватный
`#implementationHolder`, выбирающий носитель implementation: вложенный
`bpmn:MessageEventDefinition`, если он есть на BO, иначе сам BO). `#getHandlerKey`
теперь делегирует хелперу. Плашка `</>` (цветная для затронутых в MR, нейтральная
по выделению, клик → diff/код) заработала для message **end** и message
**intermediate throw** событий «бесплатно» — `handler-locator.js` (резолв/матч по
строковому ключу) и `handler-navigator.js` (обход реестра) не менялись по логике.
Покрыто 11 юнит-тестами в `test/differ/navigation/handler-locator.test.js`
(регресс service task class/external/delegate + события: nested class/delegate/
external, выбор msgDef среди нескольких def, null для timer/без implementation/без
def/без BO). `npm test` зелёный (776 тестов).

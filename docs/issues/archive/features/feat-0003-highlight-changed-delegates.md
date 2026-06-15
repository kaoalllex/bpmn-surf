---
id: FEAT-0003
title: Подсветка элементов, чьи делегаты изменились
priority: medium
status: done
---

## Постановка

Подсвечивать Service Task и др. элементы, которые по схеме не менялись, но в этом же MR менялась логика их Java/Kotlin-делегата. Должно быть видно и когда параметры элемента тоже менялись (сейчас уже синий от изменения пропертей).

Варианты: «кнопка» перехода к делегату рядом с элементом / в панели Implementation (выделять, если делегат изменён в этом MR); рамка вокруг элемента; отдельный цвет (конфликт цветов).

## Контекст

- Связано с [FEAT-0004].
- Затронутые файлы: `handler-navigator.js`, `handler-locator.js`.
- Сделано: external task (был) + делегаты (`camunda:class`/`delegateExpression`) и Java-хендлеры (см. «План доработки» ниже и Историю). Глубокий анализ транзитивных зависимостей вынесен в отдельную задачу [FEAT-0015].

## План доработки (FEAT-0003 подсветка + FEAT-0004 открытие кода)

> Подготовлен 2026-06-15. Решения согласованы с пользователем: поддержать **и** `camunda:class`, **и** `camunda:delegateExpression`; матч — по **простому имени класса** (не FQN); добавить расширение `.java`. Транзитивный анализ — в [FEAT-0015]. **Реализован 2026-06-15** (см. Историю) — план оставлен как запись о сделанном.

### Идея: единый ключ хендлера

Сейчас весь функционал завязан на topic-строку: `Map<topic, {filePath, diffType}>`, BO читается как external/topic, поиск — по топику. Обобщаем до **namespaced-ключа**:

- `topic:<topic>` — external task (как сейчас);
- `class:<SimpleName>` — делегат (и `camunda:class`, и `delegateExpression`).

`camunda:class="com.foo.Bar"` → `class:Bar`. `delegateExpression="${bar}"` → бин `bar` → по Spring-конвенции (имя бина = имя класса с маленькой буквы) класс `Bar` → `class:Bar`. Изменённый файл `Bar.kt`/`Bar.java`, объявляющий `class Bar`, → `class:Bar`. Все три сходятся на `class:Bar` — переиспользуем существующий поиск `class <Name>` (`#searchExternalTaskBeanLocation`).

### Изменения по файлам

**1. `src/differ/navigation/handler-navigator.js`** — сторона «спроса» (элемент → ключ):
- `#getExternalTopic(elem)` (стр. 91-97) → `#getHandlerKey(elem)`, возвращает namespaced-ключ или null:
  - `bo.type === 'external' && bo.topic` → `topic:${bo.topic}`;
  - `bo.get('camunda:class')` → `class:${simpleClassName(...)}`;
  - `bo.get('camunda:delegateExpression')` → вынуть бин из `${...}`, `class:${capitalizeFirstLetter(bean)}`; сложное выражение (точки/вызовы) → null (ограничение).
  - ⚠️ Атрибуты читать через `bo.get('camunda:class')` / `bo.get('camunda:delegateExpression')` (а не `bo.class` — `class` зарезервировано). Проверено: атрибуты есть в `libs/camunda-bpmn-moddle/resources/camunda.json`.
- Все обращения к topic в `refreshChangedBadges` (68-74), `showOverlayForSelectedElement` (79-89), `#onOpenCode`/`#resolveTargetUrl` (119-168) → работать с обобщённым ключом. Делегатные таски теперь тоже получают on-demand бейдж по выделению — ожидаемо.
- Для fallback-поиска `blobSearchPageUrl` нужен «человеческий» термин: для `topic:` — топик, для `class:` — имя класса. Прокинуть термин из ключа.
- Обновить шапку-комментарий (стр. 1-20): делегаты больше не «future extension».

**2. `src/differ/navigation/handler-locator.js`** — стороны «предложения» (изменённые файлы) и резолва:
- `#HANDLER_FILE_EXTENSIONS` (стр. 25): `['.kt', '.java']`. Регэксп подписки уже language-agnostic; `class <Name>` работает и в Java.
- `findChangedHandlers` (128-150): для каждого изменённого хендлер-файла собирать ключи = topic-ключи (`extractHandlerTopics`, как сейчас) ∪ class-ключи. Добавить static `extractDeclaredClassNames(content)` (regex `\bclass\s+([A-Za-z_]\w*)`) → `class:<Name>`. Над-сбор безопасен: `class:Foo` даёт бейдж, только если на схеме есть элемент с делегатом `Foo`.
- `resolveLocation(topic, ref)` (157-174) → `resolveLocation(key, ref)`, диспетчер по префиксу:
  - `topic:` → как сейчас (`#searchSubscriptionLocation || #searchExternalTaskBeanLocation`);
  - `class:` → новый `#searchClassDeclarationLocation(className, ref)` — это `#searchExternalTaskBeanLocation` (296-318) без требования аннотации `@ExternalTaskBean` (берём первый hit в хендлер-файле). Рефакторинг: выделить общий приватный поиск по `class <Name>` с опц. предпочтением аннотации.
- Обновить шапку (стр. 4-22): делегаты поддержаны; оставить заметку только про транзитивность ([FEAT-0015]).
- (Опционально, вне минимального объёма) переименовать класс `ExternalTaskHandlerLocator` → `HandlerLocator` (затрагивает `test/support/scope.js`, `bpmn-differ.js`, тесты). Можно отложить, обновив только doc-комментарий.

**3. `src/differ/bpmn/bpmn-differ.js`** — изменений не требуется: map для него непрозрачен; `#loadChangedHandlers` (331-345) и проброс в навигатор остаются.

### Заметка про FQN и коллизии (по запросу)

Матч по простому имени класса (`Bar`) допускает теоретическую **коллизию**: два класса `Bar` в разных пакетах дадут один ключ `class:Bar` — бейдж/резолв может указать не на тот файл. На практике редко. Если станет проблемой — перейти на FQN: ключ `class:com.foo.Bar`, package брать из пути изменённого файла + объявления, на стороне BO — прямо из `camunda:class`. Зафиксировать этот компромисс комментарием у `#getHandlerKey` и `extractDeclaredClassNames`.

### Известные ограничения (задокументировать в коде и в Истории по завершении)
- `delegateExpression` с нестандартным бином (`@Component("custom")`, бин ≠ декапитализированное имя класса) не резолвится по конвенции — вне объёма этой итерации.
- `delegateExpression` со сложным выражением (вызовы методов, навигация по точкам) → ключ не строится.
- Матч по простому имени → возможные коллизии пакетов (см. выше).

### Тесты (`test/handler-locator.test.js`; стиль — много мелких, только публичный API)
- `isHandlerFile` принимает `.java`.
- `extractDeclaredClassNames`: один/несколько классов, с модификаторами/аннотациями, Kotlin и Java, пусто/null.
- Чистые хелперы ключей сделать static и покрыть: `simpleClassName('com.foo.Bar') === 'Bar'`, извлечение бина из `${bar}`, `capitalizeFirstLetter`. Разместить в локаторе, чтобы тестировать без bpmn-js.
- Навигаторная сторона (`#getHandlerKey`) завязана на bpmn-js BO → юнитами не покрываем (как и сейчас у `HandlerNavigator`); проверка — ручная.

### Ручная проверка
MR с изменением: (а) external-task `.kt` — регресс; (б) делегат `camunda:class` на `.kt` и `.java`; (в) делегат `delegateExpression="${bean}"`. Проверить бейдж нужного цвета (added/changed/removed) и открытие кода / MR-diff. См. `docs/testing.md`.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-15 · claude-opus-4-8 · (ветка `feature/delegate-change-highlight`)

Реализован обобщённый путь хендлеров — задача закрыта. Введён namespaced-ключ `topic:<topic>` | `class:<SimpleName>`, на нём завязаны и подсветка, и открытие кода (FEAT-0004):

- `handler-navigator.js`: `#getExternalTopic` → `#getHandlerKey(elem)` — строит ключ из BO: external task → `topic:`; `camunda:delegateExpression="${bean}"` → `class:<Bean с большой буквы>`; `camunda:class` → `class:<SimpleName>` (delegateExpression проверяется раньше class; через статические хелперы локатора). Атрибуты читаются `bo.get('camunda:class')` / `bo.get('camunda:delegateExpression')` (`class` зарезервирован). Делегатные таски теперь тоже получают on-demand бейдж по выделению.
- `handler-locator.js`: `#HANDLER_FILE_EXTENSIONS` += `.java`; `extractDeclaredClassNames` (regex `\bclass\s+<Name>`) + `extractHandlerKeys` (topic-ключи ∪ class-ключи); статические хелперы ключей `simpleClassName` / `classKeyFromClassName` / `classKeyFromDelegateExpression` / `termFromKey`; `findChangedHandlers` собирает namespaced-ключи; `resolveLocation(key, ref)` — диспетчер по префиксу; `#searchExternalTaskBeanLocation` и новый `#searchClassDeclarationLocation` сведены к общему `#searchClassLocation(className, ref, preferAnnotation)`.
- Тесты: `isHandlerFile` для `.java`; покрыты `extractDeclaredClassNames`, `extractHandlerKeys`, `simpleClassName`, `classKeyFromClassName`, `classKeyFromDelegateExpression` (вкл. `${...}`/`#{...}`, сложные выражения → null), `termFromKey`. Навигаторная сторона (`#getHandlerKey`) на bpmn-js BO — ручная проверка. Все 278 тестов зелёные.

Ограничения (задокументированы в шапке `handler-locator.js`): нестандартный бин делегата, сложное выражение `delegateExpression`, коллизии простых имён классов между пакетами; транзитивный анализ — [FEAT-0015]. Класс `ExternalTaskHandlerLocator` переименован в `HandlerLocator` — имя отражает поддержку и external task, и делегатов (затронуты `handler-navigator.js`, `bpmn-differ.js`, `test/support/scope.js`, тесты, `docs/architecture.md`).

### 2026-06-14 · — · (ветка `feature/delegate-change-highlight`)

Сделано для external task на Kotlin: на таске с затронутым в MR обработчиком постоянно показывается overlay-плашка «‹/›» (`handler-navigator.js`), цвет — по типу изменения файла-хендлера (зелёный=добавлен, синий=изменён, красный=удалён, как цвета diff'а); тип определяется по флагам MR changes API, обратным сканом `.kt`-файлов по топику (`handler-locator.js#findChangedHandlers` → `Map<topic, {filePath, diffType}>`). Удалённый хендлер сканируется на target-ref и виден на target-версии схемы (где шаг ещё есть); добавленный — на mr-версии. Сигнал развязан с синей подсветкой (изменение имени топика в схеме).

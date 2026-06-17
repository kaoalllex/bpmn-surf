---
id: BUG-0011
title: Полностью отключить редактирование BPMN-диаграммы, сохранив режим просмотра
priority: medium
status: done
---

## Постановка

В BPMN-диффере диаграмму всё ещё можно редактировать, хотя редактирование должно
быть отключено: элементы перетаскиваются, точки/изломы стрелок (waypoints) двигаются,
двойной клик по элементу открывает правку названия/описания на канве, а поля панели
свойств — настоящие редактируемые input'ы. Это побочные правки никуда не сохраняются
(дифер ничего не коммитит), но создают ложное впечатление редактора и мешают просмотру.

Нужно **полностью** отключить редактирование, **сохранив полноценный режим просмотра**:
- выделение элемента кликом → панель свойств показывает его параметры;
- подсветка диффа (зелёный/красный/синий), таблица изменений, поиск, плашки навигации
  (Call Activity «⤵», обработчики «‹/›») работают как сейчас;
- задел под будущие плашки-комментарии к элементам ([IDEA-0002]) не ломается —
  overlays и выделение должны остаться рабочими.

DMN-сторона уже read-only (грузится `dmn-viewer`, моделлер не создаётся) — её **не трогаем**.

## Контекст

### Корневая причина

Дифер рендерит BPMN через **полноценный редактор** `BpmnJS` Modeler
(`libs/bpmn-js/bpmn-modeler.production.min.js`, bpmn-js 18.18), а не через viewer
(`bpmn-differ.js:166` `#createModeler()` → `new BpmnJS({...})`). Редактирование пытались
отключить **косметически**, спрятав видимые контролы через `display:none`:
- `#hideModelerPalleteAndPoweredByLabel()` (`bpmn-differ.js:471`) — прячет `.djs-palette`;
- `#hideSchemaEditorControls()` (`bpmn-differ.js:463`) — прячет `.djs-context-pad`,
  вызывается на **каждом** `selection.changed` (`#onSelectedElementChanged`, `bpmn-differ.js:365`),
  дважды, с `delay(100)`.

Скрытие кнопок не отключает интерактивные модули моделлера. Активными остаются
(события подтверждены в dist `bpmn-modeler.production.min.js`):
`shape.move.start` (перетаскивание фигур), `bendpoint.move.start`,
`connectionSegment.move.start` (двигать стрелки/waypoints),
`element.dblclick` → `directEditing.activate` (правка текста на канве),
`resize.start`, `connect.start`. Плюс редактируемые поля панели свойств.

### Почему нельзя просто заменить Modeler на Viewer

Два потребителя завязаны на editing-инфраструктуру моделлера, и при переходе на
`NavigatedViewer` они отвалятся:
1. **Подсветка диффа** — `DiffHighlighter.paint()` (`diff-highlighter.js:40,63`) красит
   через `modeling.setColor(...)`. Сервис `modeling` есть только в Modeler. (Маркеры
   `canvas.addMarker` — `diff-highlighter.js:105` — работают и во viewer; проблема именно
   в `setColor`.)
2. **Панель свойств** `bpmn-js-properties-panel` (5.58) построена поверх Modeler
   (commandStack/modeling); во viewer не инициализируется.

Поэтому правильный путь — **оставить Modeler, но заглушить редактирующие взаимодействия**,
а не менять движок.

### Проверено

- Глобального флага `readOnly` у `bpmn-js-properties-panel` 5.58 нет: в dist `config.readOnly`
  относится только к вложенному FEEL/CodeMirror-редактору, не ко всей панели. Значит панель
  глушим отдельно (см. шаг 2).
- Контейнер панели свойств: `BpmnDifferView.PROPS_ID` (`bpmn-differ-view.js:6`,
  `bpmnProps_<суффикс>`); корневой класс контента панели — `.bio-properties-panel`.
- Связь: [IDEA-0002] (комментарии к элементам) — opt-in оверлеи поверх схемы; этот фикс
  должен оставить overlays/selection рабочими, чтобы не блокировать IDEA-0002.

## Что и как править

Все правки — только в BPMN-стороне: `bpmn-differ.js` + `styles.css`. DMN не трогаем.

### Шаг 1. Veto edit-взаимодействий на канве (EventBus)

bpmn-js шлёт отменяемые `*.start`/`activate` события; высокоприоритетный слушатель,
вернувший `false`, отменяет действие — команда даже не создаётся. Подход аддитивный,
не лезет во внутренности DI, устойчив к версиям библиотеки.

В `show()` рядом с получением `bpmnJSEventBus` (`bpmn-differ.js:51`) добавить:

```js
const EDIT_EVENTS = [
    'shape.move.start', 'bendpoint.move.start', 'connectionSegment.move.start',
    'resize.start', 'connect.start', 'global-connect.start',
    'element.dblclick', 'directEditing.activate'
];
// High priority so the veto fires before the default editing handlers.
bpmnJSEventBus.on(EDIT_EVENTS, 2000, () => false);
```

- Сохраняется: `element.click` (выделение → `selection.changed` → панель свойств и плашки),
  hover, overlays, zoom/pan.
- После этого `#hideSchemaEditorControls()` на каждом выделении не нужен (context-pad
  содержит только edit-действия): можно убрать его вызов из `#onSelectedElementChanged`
  (`bpmn-differ.js:365`) и сам метод (`bpmn-differ.js:463`) вместе с хаком `delay(100)`.
  Косметическое одноразовое скрытие палитры/`.bjs-powered-by`
  (`#hideModelerPalleteAndPoweredByLabel`, `bpmn-differ.js:471`) — оставить.
  При желании в тот же метод добавить одноразовое скрытие `.djs-context-pad`.

Список `EDIT_EVENTS` вынести в `static` поле класса (или модульную константу) — это даёт
точку для юнит-теста (см. ниже) и единый источник правды.

### Шаг 2. Панель свойств — read-only

Глобального флага нет, панель перерисовывается (preact), поэтому надёжнее CSS, а не
DOM-атрибуты. Блокируем поля ввода, оставляя сворачивание/разворачивание групп и скролл.
В `styles.css` (секция differ-страницы):

```css
/* BUG-0011: properties panel is view-only — block field input, keep group
   headers (collapse/expand) and scrolling working. */
.bio-properties-panel input,
.bio-properties-panel textarea,
.bio-properties-panel select,
.bio-properties-panel [contenteditable],
.bio-properties-panel .bio-properties-panel-feel-editor {
    pointer-events: none;
}
```

- Заголовки групп — отдельные кнопки (`.bio-properties-panel-group-header`), их
  `pointer-events` не трогаем → раскрытие групп и просмотр свойств сохраняются.
- Проверить классы по факту в DOM запущенного дифера (имена `.bio-properties-panel*`
  принадлежат `@bpmn-io/properties-panel`); при расхождении — подправить селекторы.
  При необходимости сузить scope: на контейнер `#${BpmnDifferView.PROPS_ID}` повесить
  класс-маркер и префиксовать им селекторы.

### Чего НЕ делать (риски выхода за scope)

- Не менять `bpmn-modeler.production.min.js` на viewer-сборку (сломает `setColor` и панель).
- Не переопределять модули моделлера (`contextPadProvider`/`paletteProvider`/`labelEditingProvider`)
  через `additionalModules` — это рабочая, но более хрупкая к версиям альтернатива; для
  данной задачи veto на EventBus достигает того же проще. Если шаг 1 окажется недостаточным,
  рассмотреть как запасной вариант и описать в истории.
- Не трогать DMN-дифер и общие классы так, чтобы менялось их поведение для DMN.

## Сохранение текущей функциональности (чек-лист регрессии)

После правок проверить (ручная проверка в реальном дифере + прогон тестов):

1. **Выделение**: клик по элементу → панель свойств показывает его параметры; повторные
   клики обновляют панель. `selection.changed` → `#onSelectedElementChanged` отрабатывает.
2. **Подсветка диффа**: зелёный/красный/синий на фигурах и строках, TextAnnotation,
   таблица изменений в футере, кнопка Highlight (toggle + pulse-анимация) — без изменений.
3. **Поиск** (Ctrl/Cmd+F, в т.ч. русская раскладка): находит, центрирует, выделяет элемент,
   панель свойств показывает его параметры (поиск использует `selection.select`).
4. **Плашки навигации**: Call Activity «⤵» и обработчики «‹/›» появляются на выделенном
   элементе, кликабельны, проваливание/открытие кода работает (overlays + клики живы).
5. **Switch branch / download / zoom / fit / close** — без изменений.
6. **Редактирование запрещено**: перетащить элемент — нельзя; потянуть стрелку/waypoint —
   нельзя; двойной клик по элементу не открывает правку текста; поля панели свойств не
   редактируются; палитра/context-pad не видны.
7. **Вложенный дифер Call Activity** (новая вкладка) — то же поведение (тот же `BpmnDiffer`).
8. **DMN-дифер** — поведение не изменилось.

## Тесты

- Юнит-тесты на живой bpmn-js моделлер тяжёлые и хрупкие — основную проверку отключения
  редактирования делаем **ручной** (чек-лист выше, пп. 1–6).
- Что покрыть юнитом (в духе проекта: мелкие тесты на чистые функции/публичные данные —
  `test/bpmn/bpmn-differ.test.js` зеркалит `src/differ/bpmn/bpmn-differ.js`):
  - `EDIT_EVENTS` как `static`-поле содержит ожидаемый набор имён событий (защита от
    случайного удаления строки в списке) — без инстанцирования моделлера.
  - Если scope панели сужается классом-маркером — тривиальный тест, что класс проставляется
    (по аналогии с `BpmnDifferView.clampPanelWidth`).
- Перед push — `npm test` (структурные тесты реестров не затрагиваются: новых файлов нет).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (condition re-inject)

Остаток той же таймингово-регрессии в условии: раскрыть группу Condition, затем
выделить другой sequence flow с изменённым условием → форматирование/подсветка не
появлялись. Отличие от прочих хайлайтов: условие не перекрашивает существующий узел
панели (такие цвета переживают ре-рендер), а **инжектит свой `div`** рядом с нативным
input. Panel ре-рендерится на смене выделения (preact) и вычищает чужой узел при
реконсиляции; мой поллинг находил **старый** input мгновенно и инжектил блок до
ре-рендера → preact его срезал. Раньше это маскировал `delay(100)`.

Решение: в `showConditionExpression` инжект + подтверждение, что блок пережил интервал
поллинга, с ре-инжектом до стабилизации панели (`doWithAttempts(…, 30, 50)`); input
перечитывается каждую попытку (preact может заменить узел), блок помечается
`data-condition-for=<id>`. Добавлен регрессионный тест (панель один раз срезает блок →
метод переинжектит). 708 tests passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (аудит + doWithAttempts)

Аудит «нет ли ещё мест, зависевших от удалённого `delay(100)`». Проверены все
обращения к DOM в `src/differ`. Все потребители **preact-рендеренной** панели свойств
теперь поллят: `#findGroupHeader`, `#highlightListItems`, `showConditionExpression`,
`#setPropertiesPanelContainerMaxHeight`. Навигаторы оверлеев (`showDiveInOverlay`,
`showOverlayForSelectedElement`) тоже были за тем же `delay(100)`, но читают DOM,
который diagram-js `overlays.add()` создаёт **синхронно** (не preact) — поллинг им не
нужен, регрессии нет. DMN-сторона (`dmn-differ`, `dmn-diff-painter`) — отдельный поток,
моим изменением не затронута, где надо уже поллит (`.view-drd`). Косметические
одноразовые скрытия палитры/`.bjs-powered-by` — init-time, вне flow выделения.

Заодно улучшен `doWithAttempts` (`utils.js`): убран лишний `await delay` после
последней проверки (мёртвое ожидание перед `return null`), `var`→`const`,
добавлен док-комментарий о контракте (синхронный `action`, falsy = retry). Контракт
бюджета `attempts × delayMs` сохранён — потребители (`gitlab-dom-scraper`, `dmn-differ`)
не затронуты. Тест усилен: проверка ровно `attempts` вызовов при неудаче. 707 tests passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (регрессия 3)

Третья грань той же таймингово-регрессии: перестало работать форматирование/подсветка
Condition Expression (группа Condition красилась, но текст условия не форматировался).
Причина — `PropertiesPanelHighlighter.showConditionExpression` синхронно искал
`#bio-properties-panel-conditionExpression` сразу при выделении, до рендера панели
preact'ом; раньше это прикрывал удалённый `await delay(100)`. Решение: метод стал
`async` и поллит появление элемента через `doWithAttempts` (как `#findGroupHeader`
и `#highlightListItems`). Тесты `showConditionExpression` переведены на `await`,
добавлен регрессионный тест (input появляется через 60мс — форматирование дожидается).
707 tests passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (регрессия 2)

Фикс второй грани той же регрессии: после Switch branch (особенно если списочный
элемент раскрыт) элементы списка переставали краситься. Корень — порядок вызовов:
`#showXml` при импорте переселектит элемент → синхронный `selection.changed` →
`highlightDiffPropGroups`, который **синхронно захватывает текущие diff-данные**.
Но `setDiffData` нового направления вызывался только в `#highlightDiffs` уже **после**
`#showXml`. То есть подсветка панели на свитче читала данные предыдущего направления;
для added/removed-элементов (лейбл есть лишь в одной версии) `#findListItemHeaders`
их не находил. Раньше это маскировалось удалённым `await delay(100)`, который
откладывал подсветку на макрозадачу — уже после `setDiffData`.

Решение: `#highlightDiffs` разделён на `#prepareDiffData` (compute + `setDiffData`,
вызывается **до** `#showXml`) и `#paintDiffs` (покраска канвы/таблицы, **после**
импорта). Теперь подсветка на `selection.changed` сразу видит корректное направление —
без двойных вызовов и гонок. Заодно чинится подсветка condition-выражения на свитче
(тоже зависит от `setDiffData`). Проверка — ручная (оркестрация `bpmn-differ.js`,
UNTESTED_BY_DESIGN). 706 tests passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (регрессия)

Фикс регрессии по фидбэку: сломалась подсветка элементов списочных свойств в панели
(ошибки `list item "…" not found in group "…"`). Причина — удаление метода
`#hideSchemaEditorControls()` заодно убрало `await delay(100)`, который неявно давал
preact-панели время отрендерить DOM до подсветки. `PropertiesPanelHighlighter.#highlightListItems`
искал элементы списка однократно (в отличие от `#findGroupHeader`, который поллит через
`doWithAttempts`) и попадал на ещё не отрендеренный список. Решение:
`#highlightListItems` теперь дожидается появления списка (`doWithAttempts` на
`.bio-properties-panel-collapsible-entry-header-title`) и только затем матчит дескрипторы —
устойчиво к таймингу, без возврата хака с фиксированной задержкой. Метод стал `async`,
вызов в `highlightDiffPropGroups` обёрнут `await`. Добавлен регрессионный тест
(`properties-panel-highlighter.test.js`: список рендерится через 60мс — подсветка дожидается).
706 tests passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing` (доп.)

Доработка по фидбэку: первоначальный CSS блокировал только текстовые поля, но в
панели свойств оставались работающими тогглы (вкл/выкл) и кнопки добавления/удаления
списочных элементов. Причина: тоггл рендерится как скрытый `<input>` под кликабельным
слайдером (`.bio-properties-panel-toggle-switch__switcher`), а add/remove — отдельные
`<button>` (`add-entry`/`remove-entry`/`remove-list-entry`/`dropdown-button`/
`group-header-button`); чекбокс переключается и кликом по лейблу. Классы выверены по
`libs/bpmn-js-properties-panel/assets/properties-panel.css`. В `styles.css` расширил
правило `pointer-events: none` на эти кликабельные обёртки. Сворачивание групп/списков
и раскрытие collapsible-записей оставлены рабочими (их триггерит `onClick: toggleOpen`
на заголовке, не на кнопках). Тесты: 705 passed.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0011-disable-bpmn-editing`

Реализован план из «Что и как править» полностью.

- **Шаг 1 (veto на EventBus).** `bpmn-differ.js`: список edit-событий вынесен в
  `static BpmnDiffer.EDIT_EVENTS`; в `show()` рядом с получением `bpmnJSEventBus`
  повешен высокоприоритетный (2000) слушатель `() => false`. Удалён метод
  `#hideSchemaEditorControls()` и его вызов из `#onSelectedElementChanged`
  (вместе с хаком `delay(100)` — `delay` остаётся в utils.js, используется в других местах).
  Косметическое скрытие палитры/`.bjs-powered-by` оставлено.
- **Шаг 2 (панель свойств read-only).** `styles.css`: `pointer-events: none` на
  `input/textarea/select/[contenteditable]/.bio-properties-panel-feel-editor`
  внутри `.bio-properties-panel`; заголовки групп не тронуты (свёртка/скролл живы).
- **Context-pad.** Скрыт через CSS `.djs-context-pad { display:none !important }`,
  а не одноразовым JS-хаком (контекст-пад создаётся лениво при первом выделении —
  одноразовое скрытие на init ненадёжно).
- **Тест.** Добавлен `test/differ/bpmn/bpmn-differ.test.js` — проверяет состав
  `EDIT_EVENTS` (защита от случайного удаления события из списка). `bpmn-differ.js`
  убран из `UNTESTED_BY_DESIGN` в `test/structure/source-layout.test.js`.
- `npm test` — 705 passed. DMN не затронут (на DMN-стороне нет `.djs-context-pad`
  и `.bio-properties-panel`, dmn-viewer уже read-only).

Регрессионный чек-лист (пп. 1–6) — ручная проверка в реальном дифере на стороне
ревьюера перед мержем; автоматически покрыт только состав `EDIT_EVENTS`.

---
id: UX-0007
title: Улучшение UX differ-страницы — resizable панель свойств, компактный тулбар, оформление
priority: medium
status: done
---

## Постановка

Улучшить UX differ-страницы по четырём направлениям:

- **A. Resizable панель свойств (BPMN).** Сейчас панель свойств — `<td>` с жёсткими
  `minWidth: 300px / maxWidth: 600px` (`bpmn-differ-view.js`), расширить нельзя;
  длинные значения (expression'ы, mappings, FQN классов) не помещаются. Доступно
  только бинарное «скрыть/показать». Нужен перетаскиваемый сплиттер между канвой и
  панелью, снятие `maxWidth`, запоминание ширины между открытиями.
- **B. Компактный тулбар.** 9 текстовых кнопок 90–130px раскиданы по двум строкам
  header'а и футеру. Зум (`Zoom In/Out/Fit`) занимает ~270px текстом → перевести в
  иконки. Сгруппировать кнопки по смыслу. Отделить деструктивный `Close`.
- **C. Визуальное оформление.** Плоский белый фон без шапки/разделителей/отступов;
  вёрстка на вложенных `<table>` с инлайн-стилями. Ввести лёгкую шапку-бар и единый
  стиль кнопок через классы в `styles.css`.
- **D. Тот же визуальный язык для DMN.** Применить шапку/группировку/иконочный зум
  к `dmn-differ-view.js` (панели свойств и сплиттера там нет — пункт A не применяется).

## Контекст

Затронутые файлы:
- `src/differ/bpmn/bpmn-differ-view.js` — layout/header/footer BPMN-differ, панель свойств (`PROPS_ID`, `propsCell`, `minWidth/maxWidth` на строках ~85-90), все кнопки.
- `src/differ/dmn/dmn-differ-view.js` — layout/header DMN-differ (нет панели свойств и футера, есть `Show full`).
- `src/differ/styles.css` — единственный CSS differ-страницы; общий для обеих вьюх.
- `src/differ/bpmn/canvas-viewport.js` — `fit()` для перерисовки канвы после resize/скрытия панели.

Ограничения и риски:
- `BpmnDifferView` и `DmnDifferView` — **отдельные файлы, не общий класс**; общий
  только `styles.css`. Визуальный язык наводим через CSS-классы, правки вёрстки —
  в обоих файлах.
- Глобальные правила `table/th/td` и `.changes-table` в `styles.css` **не трогать** —
  они влияют на таблицу изменений и внутренности bpmn-js/dmn-js. Всё новое — только
  через свои классы (`.differ-toolbar`, `.differ-btn`, `.differ-splitter`, …).
- Layout на `<table>` целиком не переписывать (риск регрессий с `viewport.fit()`),
  ограничиться точечными правками. Логику зума/fit/diff/поиска не менять.

План реализации (порядок A→B→C→D):

- **A.** Вставить узкий `<td>`-сплиттер (4–6px, `cursor: col-resize`, класс
  `.differ-splitter`, hover-подсветка) между `canvasCell` и `propsCell`. Снять
  `maxWidth`, задать `minWidth: 250px` и потолок относительно окна (≤80vw). Drag:
  `mousedown` на сплиттере → `mousemove` на `document` → `propsCell.style.width`;
  `mouseup` → снять слушатели. Ширину клэмпить чистой функцией
  `clampPanelWidth(desired, min, max)` (покрыть юнит-тестом). По drag-end — сохранять
  в `localStorage` (ключ `bpmnDiffer.propsWidth`), при `build()` восстанавливать; раз
  дёрнуть `viewport.fit(true)`. Кнопка `Hide properties` прячет/показывает и сплиттер.
- **B.** Зум → иконки `+`/`−`/`⤢` (юникод-глифы, без новых ассетов) с `title`.
  Группировка: [вид] · [версия] · [Close]. Колбэки и поведение — без изменений.
- **C.** Классы `.differ-toolbar`, `.differ-btn`, `.differ-icon-btn`,
  `.differ-btn-group`, `.differ-splitter`, `.differ-btn-danger`. Инлайн-стили заменить
  на классы, сохранив GitLab-классы кнопок (нативный вид).
- **D.** Применить шапку/группировку/иконочный зум к `dmn-differ-view.js`.

Проверка: `npm test` (зелёные перед push); проверка в Chrome на реальном MR
(BPMN и DMN) — resize, запоминание ширины, hide/show, иконки зума, Close. При
изменении вёрстки актуализировать `docs/architecture.md`.

Для визуальной проверки можно использовать установленный **Chrome DevTools MCP**
(локальный stdio, scope local; см. память `mcp-local-only.md` — разрешены только
локальные MCP): открыть differ-страницу, делать скриншоты до/после, двигать сплиттер
и проверять тулбар на узком окне. Инструменты MCP доступны после перезапуска сессии
Claude Code.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись. Новые записи — сверху. -->

### 2026-06-16 · claude-opus-4-8 · ветка `feature/ux-0007-differ-ux-overhaul`

Реализованы все четыре направления (A→B→C→D).

- **A.** В `bpmn-differ-view.js` между канвой и панелью свойств добавлен `<td>`-сплиттер
  (`.differ-splitter`, `cursor: col-resize`, hover-подсветка). Снят `maxWidth`, `minWidth`
  поднят до 250px, потолок — `0.8 * innerWidth`. Drag: `mousedown` на сплиттере →
  `mousemove`/`mouseup` на `document` → `propsCell.style.width`. Ширина клэмпится чистой
  статической `BpmnDifferView.clampPanelWidth(desired, min, max)` (юнит-тест), по drag-end
  сохраняется в `localStorage[bpmnDiffer.propsWidth]`, при `build()` восстанавливается;
  по drag-end и hide/show — `viewport.fit(true)`. «Hide properties» прячет и панель, и сплиттер.
- **B.** Зум переведён в иконки `+`/`−`/`⤢` (юникод, без ассетов) с `title`. Кнопки
  сгруппированы: [файл] · [ветка] · [вид] · [Close]; `Close` отделён и помечен `.differ-btn-danger`.
- **C.** Header переписан в flex-тулбар `.differ-toolbar` с группами `.differ-btn-group`
  (лёгкая шапка-бар, разделители между группами). Инлайн-стили кнопок заменены на классы
  `.differ-btn`/`.differ-icon-btn`; GitLab-классы кнопок сохранены (нативный вид). Кнопки
  строятся хелперами `#button`/`#group`.
- **D.** Тот же визуальный язык применён к `dmn-differ-view.js` (тулбар, группы, иконочный зум;
  панели свойств и сплиттера там нет).

Поведение колбэков зума/fit/diff/поиска/highlight/download/switch не менялось. Намеренная
мелкая правка в рамках A: при показе панели свойств `display` сбрасывается в `''`
(возврат к `table-cell`) вместо прежнего `block`, ломавшего табличный layout.

Файлы: `src/differ/bpmn/bpmn-differ-view.js`, `src/differ/dmn/dmn-differ-view.js`,
`src/differ/styles.css`, `test/support/scope.js` (+`BpmnDifferView` в харнесс),
`test/differ/bpmn/bpmn-differ-view.test.js` (новый), `test/structure/source-layout.test.js`
(убран из `UNTESTED_BY_DESIGN`), `docs/architecture.md`. `npm test` — 640/640 зелёных.
Визуальная проверка в Chrome на реальном MR — за пользователем.

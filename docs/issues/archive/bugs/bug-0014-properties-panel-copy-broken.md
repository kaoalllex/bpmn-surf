---
id: BUG-0014
title: Не работает копирование текста из полей панели свойств (регрессия BUG-0011)
priority: medium
status: done
---

## Постановка

В BPMN-диффере открываешь панель свойств выделенного элемента и хочешь скопировать
текст из поля (ID, имя, documentation и т.п.) — выделить мышью и `Ctrl/Cmd+C` нельзя.
Поля «мёртвые»: клик по ним не ставит курсор, текст не выделяется.

Нужно вернуть возможность **выделять и копировать** текст из обычных текстовых полей
панели свойств, **сохранив запрет на редактирование** (не вернув [BUG-0011]).

## Контекст

### Корневая причина

Регрессия фикса [BUG-0011] (шаг 2 «панель свойств read-only»). Редактирование полей
отключили чисто через CSS в `src/differ/styles.css`:

```css
.bio-properties-panel input,
.bio-properties-panel textarea,
.bio-properties-panel select,
.bio-properties-panel [contenteditable],
.bio-properties-panel .bio-properties-panel-feel-editor,
/* + тоглы, чекбоксы, кнопки add/remove, dropdown, feel-popup */ {
    pointer-events: none;
}
```

`pointer-events: none` на `input`/`textarea` блокирует **любое** взаимодействие мышью:
нет клика → нет фокуса → нет выделения мышью → нет копирования. Это ровно те текстовые
поля, из которых пользователь копирует.

Чисто-CSS способа «нельзя редактировать, но можно выделить/скопировать» нет:
`pointer-events:none` несовместим с копированием, а `user-select` не помогает (без клика
выделение не начать). Значит правки текстовых полей надо блокировать не-CSS-механизмом.

### Решение (согласовано с пользователем) — veto `beforeinput`

- Убрать `input` и `textarea` из правила `pointer-events: none` в `styles.css` — они снова
  кликабельны, выделяемы и копируемы.
- Правки этих полей блокировать **одним делегированным слушателем `beforeinput`** в
  capture-фазе на контейнере панели свойств (`#${BpmnDifferView.PROPS_ID}` /
  `.bio-properties-panel`), вызывающим `preventDefault()`. `beforeinput` покрывает набор
  текста, backspace/delete, вставку (`insertFromPaste`) и drop (`insertFromDrop`); при
  этом `Ctrl/Cmd+C` и выделение `beforeinput` не порождают → копирование сохраняется.
  Делегирование на контейнере переживает preact-ре-рендеры панели без полла/MutationObserver.
- Идейно это тот же «аддитивный veto», что и EventBus-veto на канве из [BUG-0011]
  (`BpmnDiffer.EDIT_EVENTS`, `() => false`).

Что **остаётся** под `pointer-events: none` (не текстовый ввод — copy неактуален, а
надёжно заглушить их `beforeinput`-veto сложнее): `select`, `[contenteditable]`,
`.bio-properties-panel-feel-editor`, тоглы (`...toggle-switch__switcher`,
`...feel-toggle-switch`), чекбоксы (`...checkbox`, `...feel-checkbox`), кнопки
add/remove (`...add-entry`, `...remove-entry`, `...remove-list-entry`),
`...group-header-button`, `...dropdown-button`, `...open-feel-popup`.

### Вне scope

- **Копирование FEEL-выражений** (CodeMirror / `contenteditable` /
  `.bio-properties-panel-feel-editor`) — отдельная задача. CodeMirror имеет собственную
  обработку ввода/буфера обмена, простой veto `beforeinput` там ненадёжен; чтобы не
  рисковать возвратом [BUG-0011] на FEEL-полях, в этом баге их не трогаем (остаются
  некопируемыми, как и сейчас — регрессии относительно текущего состояния нет).
- DMN-сторона не затронута (там нет `.bio-properties-panel`, dmn-viewer уже read-only).

### Регрессионный чек-лист (после фикса)

1. Из обычных полей панели (ID, имя, documentation) текст **выделяется и копируется**
   (`Ctrl/Cmd+C`).
2. Редактирование запрещено: набор символов, backspace/delete, вставка, drop в эти поля
   **не меняют значение**.
3. Тоглы/чекбоксы/кнопки add-remove/dropdown/FEEL-попап по-прежнему не срабатывают.
4. Сворачивание/разворачивание групп и списков, скролл панели — работают.
5. Подсветка диффа в панели (группы, list-items, condition expression) — без изменений.

### Затронутые файлы

- `src/differ/styles.css` — убрать `input`/`textarea` из `pointer-events: none`.
- `src/differ/bpmn/bpmn-differ.js` — навесить делегированный `beforeinput`-veto на
  контейнер панели (рядом с прочей инициализацией панели/`show()`).

### Связи

- Регрессия [BUG-0011] (отключение редактирования BPMN, сохранив просмотр).
- Близко по теме: [BUG-0009] (Ctrl+C блокируется обработчиком) — другой источник, не путать.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0014-properties-panel-copy`

Реализован вариант A. `styles.css`: убрал `input`/`textarea` из правила
`pointer-events: none` (остальные контролы — `select`, `contenteditable`,
FEEL-редактор, тоглы, чекбоксы, кнопки add/remove, dropdown, feel-popup — оставлены).
`bpmn-differ.js`: в `show()` рядом с canvas-veto ([BUG-0011]) навешен делегированный
capture-listener `beforeinput` на стабильный контейнер панели
(`#${BpmnDifferView.PROPS_ID}`), вызывающий `preventDefault()` — гасит набор/удаление/
вставку/drop, но не `Ctrl/Cmd+C` и выделение, поэтому копирование работает; делегирование
переживает preact-ре-рендеры без ре-бинда. FEEL-выражения остаются вне scope (отдельная
задача). Unit-проверка для DOM-bound orchestration в `show()` неприменима (нет чистой
функции) — проверка ручная по чек-листу. `npm test` — 765 passed.
